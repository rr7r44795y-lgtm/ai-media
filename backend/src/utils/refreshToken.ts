import { supabaseService } from './supabaseClient.js';
import { decryptToken, encryptToken } from './encryption.js';
import { Platform } from '../services/oauth.js';

export async function refreshIfExpired(platform: Platform, userId: string) {
  const { data, error } = await supabaseService
    .from('social_accounts')
    .select('*')
    .eq('platform', platform)
    .eq('user_id', userId)
    .maybeSingle();

  if (error || !data) {
    return { error: 'OAuth not found' };
  }

  const expiresAt = data.expires_at ? new Date(data.expires_at).getTime() : 0;
  const now = Date.now();
  if (expiresAt - now > 10 * 60 * 1000) {
    return { accessToken: decryptToken(data.access_token_encrypted) };
  }

  const refreshToken = decryptToken(data.refresh_token_encrypted);
  // Placeholder for per-platform refresh logic
  const refreshedToken = `${platform}-new-access-token`;
  const newExpiry = new Date(now + 60 * 60 * 1000).toISOString();

  const updateRes = await supabaseService
    .from('social_accounts')
    .update({
      access_token_encrypted: encryptToken(refreshedToken),
      refresh_token_encrypted: encryptToken(refreshToken),
      expires_at: newExpiry,
    })
    .eq('id', data.id);

  if (updateRes.error) {
    await supabaseService.from('social_accounts').update({ disabled: true }).eq('id', data.id);
    return { error: 'Refresh failed' };
  }

  return { accessToken: refreshedToken };
}
