import cron from 'node-cron';
import { supabaseService } from '../utils/supabaseClient.js';
import { sendAdminAlert } from './sendEmail.js';

const HEARTBEAT_INTERVAL = '*/1 * * * *';
const DAILY_INTERVAL = '0 3 * * *';

const enqueueWorker = async (id: string): Promise<void> => {
  await fetch(`${process.env.WORKER_ENDPOINT || 'http://localhost:4000'}/api/worker/publish?id=${id}`, {
    method: 'POST',
    headers: { 'x-cron': 'true' },
  });
};

const logHeartbeat = async (): Promise<void> => {
  await supabaseService.from('scheduler_heartbeat').insert({});
};

const reclaimStuck = async (): Promise<void> => {
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  await supabaseService
    .from('schedules')
    .update({ status: 'pending', processing_started_at: null })
    .lt('processing_started_at', twoMinutesAgo)
    .eq('status', 'processing');
};

const runScan = async (): Promise<void> => {
  const { data, error } = await supabaseService
    .from('schedules')
    .select('*')
    .in('status', ['pending', 'processing'])
    .lte('next_retry_at', new Date().toISOString())
    .order('scheduled_time', { ascending: true })
    .limit(20);

  if (error || !data) return;
  await reclaimStuck();
  for (const task of data) {
    const { data: locked } = await supabaseService
      .from('schedules')
      .update({ status: 'processing', processing_started_at: new Date().toISOString() })
      .eq('id', task.id)
      .eq('status', 'pending')
      .select('id')
      .maybeSingle();
    if (!locked) continue;
    await enqueueWorker(task.id);
  }
  await logHeartbeat();
};

const complianceAudit = async (): Promise<void> => {
  const { data: buckets } = await supabaseService.storage.listBuckets();
  const publicBuckets = (buckets || []).filter((b) => b.public);
  for (const bucket of publicBuckets) {
    await supabaseService.storage.updateBucket(bucket.name, { public: false });
    await sendAdminAlert('Storage privacy', `Bucket ${bucket.name} was public and has been closed.`);
  }

  const { data: accounts } = await supabaseService.from('social_accounts').select('id, scopes');
  for (const account of accounts || []) {
    const scopes = (account as { scopes?: string[] }).scopes || [];
    const allowed = ['pages_manage_posts', 'instagram_basic', 'linkedin_posts', 'youtube'];
    if (scopes.some((s) => !allowed.includes(s))) {
      await supabaseService.from('social_accounts').update({ disabled: true }).eq('id', account.id);
      await sendAdminAlert('OAuth scope violation', `Disabled account ${account.id} due to scopes`);
    }
  }

  const { data: beats } = await supabaseService
    .from('scheduler_heartbeat')
    .select('*')
    .order('ran_at', { ascending: false })
    .limit(1);
  const lastBeat = beats?.[0]?.ran_at ? new Date(beats[0].ran_at) : null;
  if (!lastBeat || Date.now() - lastBeat.getTime() > 3 * 60 * 1000) {
    await sendAdminAlert('Cron stalled', 'No scheduler heartbeat within 3 minutes.');
  }
};

export const startCron = (): void => {
  cron.schedule(HEARTBEAT_INTERVAL, () => {
    void runScan();
  });

  cron.schedule(DAILY_INTERVAL, () => {
    void complianceAudit();
  });
};
