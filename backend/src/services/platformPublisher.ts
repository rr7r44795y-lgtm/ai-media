import { supabaseService } from '../utils/supabaseClient.js';
import { decryptToken } from '../utils/encryption.js';
import { refreshIfExpired } from '../utils/refreshToken.js';
import { WorkerPublishResult, ScheduleRecord } from '../types.js';
import { publishPost, PublishPlatform } from './publisher.js';
import { createSignedContentLinks } from '../utils/storage.js';

const platformRateLimits: Record<string, number> = {
  ig: 100,
  facebook: 250,
  linkedin: 250,
  youtube_draft: 200,
  instagram_business: 100,
  facebook_page: 250,
};

async function checkRate(platform: string): Promise<boolean> {
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

const platformMap: Record<string, PublishPlatform> = {
  ig: 'instagram_business',
  facebook: 'facebook_page',
  linkedin: 'linkedin',
  youtube_draft: 'youtube_draft',
};

export const publishToPlatform = async (
  schedule: ScheduleRecord
): Promise<WorkerPublishResult> => {
  const platform = schedule.platform;
  const userId = schedule.user_id;
  const payload = schedule.platform_text;
  const allowed = await checkRate(platform);
  if (!allowed) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  const platformCandidates = [platformMap[platform] || platform, platform].filter(Boolean);
  const { data: account, error } = await supabaseService
    .from('social_accounts')
    .select('*')
    .eq('user_id', userId)
    .in('platform', platformCandidates)
    .eq('disabled', false)
    .maybeSingle();

  if (error || !account) {
    const signedLinks = await createSignedContentLinks(schedule.content_id);
    return { success: false, error: 'Account not connected', fatal: true, fallback_links: signedLinks };
  }

  const platformKey: PublishPlatform = platformMap[platform] || (platform as PublishPlatform);
  const refreshed = await refreshIfExpired(platformKey, userId);
  if (refreshed.error) {
    await supabaseService.from('social_accounts').update({ disabled: true }).eq('id', account.id);
    const signedLinks = await createSignedContentLinks(schedule.content_id);
    return { success: false, error: 'Token refresh failed', fatal: true, fallback_links: signedLinks };
  }

  const accessToken = refreshed.accessToken || decryptToken(account.access_token_encrypted as string);
  void accessToken;

  try {
    const result = await publishPost(
      platformKey,
      {
        content_id: schedule.content_id,
        text: typeof payload === 'string' ? payload : '',
        platform_text: payload as string,
        media_urls: [],
        scheduled_time: schedule.scheduled_time,
        social_account_id: account.id,
      },
      userId
    );
    return result;
  } catch (e) {
    return { success: false, error: e instanceof Error ? e.message : 'Publish failed' };
  }
};
