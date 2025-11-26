import { supabaseService } from '../utils/supabaseClient.js';
import { encryptToken } from '../utils/encryption.js';
import { v4 as uuid } from 'uuid';

export type Platform = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube';

export function buildAuthorizeUrl(platform: Platform, state: string): string {
  const base = process.env.BACKEND_BASE_URL;
  const redirect = encodeURIComponent(`${base}/api/oauth/${platform}/callback`);
  const clientId = process.env[`OAUTH_${platform.toUpperCase()}_CLIENT_ID`];
  const scopes = {
    instagram_business: 'instagram_basic,pages_show_list',
    facebook_page: 'pages_show_list',
    linkedin: 'r_liteprofile w_member_social',
    youtube: 'https://www.googleapis.com/auth/youtube.upload',
  }[platform];
  return `https://auth.${platform}.com/authorize?client_id=${clientId}&redirect_uri=${redirect}&response_type=code&scope=${encodeURIComponent(
    scopes
  )}&state=${state}`;
}

export async function saveTokens({
  userId,
  platform,
  accessToken,
  refreshToken,
  externalId,
  expiresAt,
}: {
  userId: string;
  platform: Platform;
  accessToken: string;
  refreshToken: string;
  externalId: string;
  expiresAt: string;
}) {
  await supabaseService.from('social_accounts').upsert(
    {
      id: uuid(),
      user_id: userId,
      platform,
      external_account_id: externalId,
      access_token_encrypted: encryptToken(accessToken),
      refresh_token_encrypted: encryptToken(refreshToken),
      expires_at: expiresAt,
    },
    { onConflict: 'user_id,platform' }
  );
}
