import { supabaseService } from '../utils/supabaseClient.js';
import { WorkerPublishResult, ScheduleRecord } from '../types.js';
import { publishPost, PublishPlatform } from './publisher.js';
import { createSignedContentLinks } from '../utils/storage.js';

const platformRateLimits: Record<PublishPlatform, number> = {
  instagram_business: 100,
  facebook_page: 250,
  linkedin: 250,
  youtube_draft: 200,
};

async function checkRate(platform: PublishPlatform): Promise<boolean> {
  const limit = platformRateLimits[platform] ?? 200;
  const now = new Date();
  const { data } = await supabaseService.from('publisher_rate_limits').select('*').eq('platform', platform).maybeSingle();
  const windowStart = data?.window_start ? new Date(data.window_start) : null;
  const withinWindow = windowStart && now.getTime() - windowStart.getTime() < 60 * 1000;
  const count = withinWindow ? data?.count ?? 0 : 0;
  if (count >= limit) return false;
  const newCount = count + 1;
  const upsertData = {
    platform,
    window_start: withinWindow ? windowStart?.toISOString() : now.toISOString(),
    count: newCount,
  };
  await supabaseService.from('publisher_rate_limits').upsert(upsertData, { onConflict: 'platform' });
  return true;
}

export const publishToPlatform = async (
  schedule: ScheduleRecord & { social_account_id?: string }
): Promise<WorkerPublishResult> => {
  const platform = schedule.platform as PublishPlatform;
  const userId = schedule.user_id;
  const payload = schedule.platform_text;
  const allowed = await checkRate(platform);
  if (!allowed) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  const platformCandidates: PublishPlatform[] = [platform];
  const socialAccountId = schedule.social_account_id;
  if (!socialAccountId) {
    const signedLinks = await createSignedContentLinks(schedule.content_id);
    return { success: false, error: 'Account not connected', fatal: true, fallback_links: signedLinks };
  }

  const { data: account, error } = await supabaseService
    .from('social_accounts')
    .select('*')
    .eq('id', socialAccountId)
    .eq('user_id', userId)
    .in('platform', platformCandidates)
    .eq('disabled', false)
    .maybeSingle();

  if (error || !account) {
    const signedLinks = await createSignedContentLinks(schedule.content_id);
    return { success: false, error: 'Account not connected', fatal: true, fallback_links: signedLinks };
  }

  try {
    const mediaUrls = await createSignedContentLinks(schedule.content_id);
    let result: WorkerPublishResult;
    switch (platform) {
      case 'facebook_page':
      case 'instagram_business':
      case 'youtube_draft':
        result = await publishPost(
          platform,
          {
            content_id: schedule.content_id,
            text: typeof payload === 'string' ? payload : '',
            platform_text: payload as string,
            media_urls: mediaUrls,
            scheduled_time: schedule.scheduled_time,
            social_account_id: account.id,
          },
          userId
        );
        break;
      case 'linkedin':
        result = await publishPost(
          platform,
          {
            content_id: schedule.content_id,
            text: typeof payload === 'string' ? payload : '',
            platform_text: payload as string,
            media_urls: mediaUrls,
            scheduled_time: schedule.scheduled_time,
            social_account_id: account.id,
          },
          userId
        );
        break;
      default:
        return { success: false, error: 'Unsupported platform' };
    }
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Publish failed' };
  }
};
