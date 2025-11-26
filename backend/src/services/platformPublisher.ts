import { supabaseService } from '../utils/supabaseClient.js';
import { decryptToken } from '../utils/encryption.js';
import { WorkerPublishResult } from '../types.js';

const platformRateLimits: Record<string, number> = {
  ig: 100,
  facebook: 250,
  linkedin: 250,
  youtube_draft: 200,
};

const recentPublishKey = (platform: string) => `rate:${platform}`;
const inMemoryRate: Record<string, number> = {};

const incrementRate = (platform: string): boolean => {
  const key = recentPublishKey(platform);
  const count = (inMemoryRate[key] ?? 0) + 1;
  inMemoryRate[key] = count;
  const limit = platformRateLimits[platform] ?? 200;
  return count <= limit;
};

export const publishToPlatform = async (
  scheduleId: string,
  platform: string,
  userId: string,
  payload: unknown
): Promise<WorkerPublishResult> => {
  const withinLimit = incrementRate(platform);
  if (!withinLimit) {
    return { success: false, error: 'Rate limit exceeded' };
  }

  const { data: account, error } = await supabaseService
    .from('social_accounts')
    .select('access_token_encrypted, refresh_token_encrypted, expires_at, scopes, id')
    .eq('user_id', userId)
    .eq('platform', platform)
    .maybeSingle();

  if (error || !account) {
    return { success: false, error: 'Account not connected' };
  }

  const accessToken = decryptToken(account.access_token_encrypted as string);
  void accessToken;

  // Simulated platform publish for now
  const targetUrl = `https://social.example.com/${platform}/posts/${scheduleId}`;
  void payload;
  return { success: true, url: targetUrl };
};
