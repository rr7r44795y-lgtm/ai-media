import { supabaseService } from './supabaseClient.js';
import { decryptToken } from './encryption.js';
import { RefreshError, SocialPlatform } from '../types.js';
import { persistRefreshedTokens, refreshSocialAccount } from '../services/refresh.js';

export interface RefreshedTokenResult {
  access_token: string;
  refresh_token?: string | null;
  expires_at: Date | null;
}

export async function refreshIfExpired(socialAccountId: string): Promise<RefreshedTokenResult> {
  const { data: account, error } = await supabaseService
    .from('social_accounts')
    .select('*')
    .eq('id', socialAccountId)
    .single();

  const platform = (account?.platform as SocialPlatform) || 'facebook_page';

  if (error || !account) {
    throw new RefreshError(platform, 'OAuth not found', false);
  }
  const expiresAt = account.expires_at ? new Date(account.expires_at) : null;
  const accessToken = account.access_token_encrypted ? decryptToken(account.access_token_encrypted) : null;
  const refreshToken = account.refresh_token_encrypted ? decryptToken(account.refresh_token_encrypted) : null;

  const threshold = new Date(Date.now() + 10 * 60 * 1000);
  if (expiresAt && expiresAt > threshold && accessToken) {
    return { access_token: accessToken, refresh_token: refreshToken, expires_at: expiresAt };
  }

  const refreshed = await refreshSocialAccount({
    id: account.id,
    platform,
    access_token_encrypted: account.access_token_encrypted,
    refresh_token_encrypted: account.refresh_token_encrypted,
    expires_at: account.expires_at,
  });

  await persistRefreshedTokens(account.id, refreshed, platform);

  return refreshed;
}
