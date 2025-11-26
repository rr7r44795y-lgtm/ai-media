import { supabaseService } from '../utils/supabaseClient.js';

export const queueGdprDelete = async (userId: string): Promise<void> => {
  const { data } = await supabaseService
    .from('gdpr_deletes')
    .select('id, processed_at')
    .eq('user_id', userId)
    .order('queued_at', { ascending: false })
    .limit(1);

  const existing = data?.[0];
  if (existing && !existing.processed_at) {
    return;
  }

  await supabaseService.from('gdpr_deletes').insert({ user_id: userId });
};

const deleteStorageForUser = async (userId: string): Promise<void> => {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || 'content';
  const { data: contents } = await supabaseService
    .from('contents')
    .select('bucket,path,url')
    .eq('user_id', userId);

  if (!contents) return;

  const grouped = new Map<string, string[]>();
  for (const item of contents) {
    const bucketName = (item.bucket as string | null) || bucket;
    const path = (item.path as string | null) || (item.url as string | null);
    if (!bucketName || !path) continue;
    const paths = grouped.get(bucketName) || [];
    paths.push(path);
    grouped.set(bucketName, paths);
  }

  for (const [bucketName, paths] of grouped.entries()) {
    await supabaseService.storage.from(bucketName).remove(paths);
  }
};

const finalizeDeletion = async (userId: string): Promise<void> => {
  await deleteStorageForUser(userId);
  await supabaseService.from('schedules').delete().eq('user_id', userId);
  await supabaseService.from('contents').delete().eq('user_id', userId);
  await supabaseService.from('social_accounts').delete().eq('user_id', userId);
  await supabaseService.from('billing').delete().eq('user_id', userId);
  await supabaseService.from('billing_pending').delete().eq('user_id', userId);
  await supabaseService.from('tags').delete().eq('user_id', userId);
  await supabaseService.from('content_tags').delete().eq('user_id', userId);
  await supabaseService.from('storage_audit').delete().eq('user_id', userId);
};

export const processPendingDeletes = async (): Promise<number> => {
  const { data: pending, error } = await supabaseService
    .from('gdpr_deletes')
    .select('id, user_id')
    .is('processed_at', null)
    .eq('status', 'queued')
    .limit(25);

  if (error || !pending?.length) return 0;

  for (const row of pending) {
    await finalizeDeletion(row.user_id);
    await supabaseService
      .from('gdpr_deletes')
      .update({ processed_at: new Date().toISOString(), status: 'completed' })
      .eq('id', row.id);
  }

  return pending.length;
};
