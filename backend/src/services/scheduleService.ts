import { supabaseService } from '../utils/supabaseClient.js';
import { ScheduleRecord, ScheduleStatus } from '../types.js';
import { sendFallbackEmail } from './sendEmail.js';
import { createSignedContentLinks } from '../utils/storage.js';

const retryDelays: Record<number, number> = {
  1: 30,
  2: 120,
  3: 600,
};

export const markProcessing = async (id: string): Promise<ScheduleRecord | null> => {
  const { data, error } = await supabaseService
    .from('schedules')
    .update({ status: 'processing' as ScheduleStatus, processing_started_at: new Date().toISOString() })
    .eq('id', id)
    .eq('status', 'pending')
    .select('*')
    .maybeSingle();
  if (error) {
    return null;
  }
  return data as unknown as ScheduleRecord | null;
};

export const markSuccess = async (id: string, url: string): Promise<void> => {
  await supabaseService
    .from('schedules')
    .update({ status: 'success', published_url: url, next_retry_at: null, last_error: null, tries: 0 })
    .eq('id', id);
};

const handleFallback = async (schedule: ScheduleRecord, error: string, links?: string[]): Promise<string[]> => {
  const signed = links || (await createSignedContentLinks(schedule.content_id));
  await supabaseService
    .from('schedules')
    .update({
      status: 'failed',
      last_error: error,
      next_retry_at: null,
      processing_started_at: null,
      fallback_sent: true,
      fallback_sent_at: new Date().toISOString(),
    })
    .eq('id', schedule.id);
  await sendFallbackEmail(schedule.user_id, schedule, signed, error);
  return signed;
};

export const markFailure = async (
  schedule: ScheduleRecord,
  error: string,
  options?: { forceFallback?: boolean; signedLinks?: string[] }
): Promise<{ fallbackTriggered: boolean; signedLinks?: string[] }> => {
  const tries = (schedule.tries ?? 0) + 1;
  const baseUpdate: Partial<ScheduleRecord> = {
    tries,
    last_error: error,
    processing_started_at: null,
  };

  const shouldFallback = options?.forceFallback || tries >= 4;

  if (shouldFallback) {
    baseUpdate.status = 'failed';
    baseUpdate.next_retry_at = null;
    baseUpdate.fallback_sent = true;
    baseUpdate.fallback_sent_at = new Date().toISOString();
    await supabaseService.from('schedules').update(baseUpdate).eq('id', schedule.id);
    const links = await handleFallback({ ...schedule, tries }, error, options?.signedLinks);
    return { fallbackTriggered: true, signedLinks: links };
  }

  const delay = retryDelays[tries] ?? 600;
  const nextRetry = new Date(Date.now() + delay * 1000).toISOString();

  await supabaseService
    .from('schedules')
    .update({
      ...baseUpdate,
      status: 'pending' as ScheduleStatus,
      next_retry_at: nextRetry,
    })
    .eq('id', schedule.id);
  return { fallbackTriggered: false };
};

export const cancelSchedule = async (id: string, userId: string): Promise<boolean> => {
  const { error } = await supabaseService
    .from('schedules')
    .update({ status: 'cancelled' })
    .eq('id', id)
    .eq('user_id', userId)
    .neq('status', 'success');
  return !error;
};
