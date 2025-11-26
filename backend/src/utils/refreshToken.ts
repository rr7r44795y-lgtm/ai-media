import { supabaseService } from './supabaseClient.js';
import { decryptToken, encryptToken } from './encryption.js';
import { Platform, refreshTokens } from '../services/oauth.js';

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

  if (!data.refresh_token_encrypted) {
    return { accessToken: decryptToken(data.access_token_encrypted) };
  }

  const refreshToken = decryptToken(data.refresh_token_encrypted);
  try {
    const refreshed = await refreshTokens(platform, refreshToken);
    const updateRes = await supabaseService
      .from('social_accounts')
      .update({
        access_token_encrypted: encryptToken(refreshed.accessToken),
        refresh_token_encrypted: refreshed.refreshToken ? encryptToken(refreshed.refreshToken) : data.refresh_token_encrypted,
        expires_at: refreshed.expiresAt || data.expires_at,
      })
      .eq('id', data.id);

    if (updateRes.error) {
      throw updateRes.error;
    }

    return { accessToken: refreshed.accessToken };
  } catch (err) {
    await supabaseService.from('social_accounts').update({ disabled: true }).eq('id', data.id);
    return { error: 'Refresh failed' };
  }
}
