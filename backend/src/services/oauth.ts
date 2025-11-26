import { v4 as uuid } from 'uuid';
import { buildLinkedInAuthUrl, exchangeLinkedInCode } from '../oauth/linkedin.js';
import { buildFacebookAuthUrl, exchangeFacebookCode } from '../oauth/facebook.js';
import { buildInstagramAuthUrl, exchangeInstagramCode } from '../oauth/instagram.js';
import { buildYouTubeAuthUrl, exchangeYouTubeCode } from '../oauth/youtube.js';
import { supabaseService } from '../utils/supabaseClient.js';
import { encryptToken } from '../utils/encryption.js';

export type Platform = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube_draft';

export function buildAuthorizeUrl(platform: Platform, state: string): string {
  const base = process.env.BACKEND_BASE_URL || '';
  const redirect = `${base}/api/oauth/${platform}/callback`;
  const clientId = process.env[`OAUTH_${platform.toUpperCase()}_CLIENT_ID`] || '';
  switch (platform) {
    case 'linkedin':
      return buildLinkedInAuthUrl(state, redirect, clientId);
    case 'facebook_page':
      return buildFacebookAuthUrl(state, redirect, clientId);
    case 'instagram_business':
      return buildInstagramAuthUrl(state, redirect, clientId);
    case 'youtube_draft':
      return buildYouTubeAuthUrl(state, redirect, clientId);
    default:
      throw new Error('Unsupported platform');
  }
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

export async function exchangeCode(platform: Platform, code: string) {
  switch (platform) {
    case 'linkedin':
      return exchangeLinkedInCode(code);
    case 'facebook_page':
      return exchangeFacebookCode(code);
    case 'instagram_business':
      return exchangeInstagramCode(code);
    case 'youtube_draft':
      return exchangeYouTubeCode(code);
    default:
      throw new Error('Unsupported platform');
  }
}
