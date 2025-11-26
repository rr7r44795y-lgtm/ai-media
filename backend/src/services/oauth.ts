import { v4 as uuid } from 'uuid';
import { buildLinkedInAuthUrl, exchangeLinkedInCode, refreshLinkedInToken } from '../oauth/linkedin.js';
import { buildFacebookAuthUrl, exchangeFacebookCode } from '../oauth/facebook.js';
import { buildInstagramAuthUrl, exchangeInstagramCode } from '../oauth/instagram.js';
import { buildYouTubeAuthUrl, exchangeYouTubeCode, refreshYouTubeToken } from '../oauth/youtube.js';
import { supabaseService } from '../utils/supabaseClient.js';
import { encryptToken } from '../utils/encryption.js';
import { OAuthTokenResult, SocialPlatform } from '../types.js';

export type Platform = SocialPlatform;

function getRedirectUri(platform: Platform): string {
  const base = process.env.BACKEND_BASE_URL || '';
  if (!base) throw new Error('BACKEND_BASE_URL is not configured');
  return `${base}/api/oauth/${platform}/callback`;
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`${key} is not configured`);
  }
  return value;
}

export function buildAuthorizeUrl(platform: Platform, state: string): string {
  const redirect = getRedirectUri(platform);
  const clientId = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_ID`);

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

export async function saveTokens(userId: string, tokenSets: OAuthTokenResult[]) {
  for (const token of tokenSets) {
    await supabaseService
      .from('social_accounts')
      .upsert(
        {
          id: uuid(),
          user_id: userId,
          platform: token.platform,
          external_account_id: token.external_account_id,
          access_token_encrypted: encryptToken(token.access_token),
          refresh_token_encrypted: token.refresh_token ? encryptToken(token.refresh_token) : null,
          expires_at: token.expires_at ? token.expires_at.toISOString() : null,
          disabled: false,
        },
        { onConflict: 'user_id,platform,external_account_id' }
      );
  }
}

export async function exchangeCode(platform: Platform, code: string): Promise<OAuthTokenResult[]> {
  const redirect = getRedirectUri(platform);
  const clientId = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_ID`);
  const clientSecret = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_SECRET`);

  switch (platform) {
    case 'linkedin':
      return exchangeLinkedInCode(code, redirect, clientId, clientSecret);
    case 'facebook_page':
      return exchangeFacebookCode(code, redirect, clientId, clientSecret);
    case 'instagram_business':
      return exchangeInstagramCode(code, redirect, clientId, clientSecret);
    case 'youtube_draft':
      return exchangeYouTubeCode(code, redirect, clientId, clientSecret);
    default:
      throw new Error('Unsupported platform');
  }
}

export async function refreshTokens(platform: Platform, refreshToken: string) {
  const clientId = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_ID`);
  const clientSecret = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_SECRET`);

  switch (platform) {
    case 'linkedin':
      return refreshLinkedInToken(refreshToken, clientId, clientSecret);
    case 'youtube_draft':
      return refreshYouTubeToken(refreshToken, clientId, clientSecret);
    case 'facebook_page':
    case 'instagram_business':
      {
        const params = new URLSearchParams({
          grant_type: 'fb_exchange_token',
          client_id: clientId,
          client_secret: clientSecret,
          fb_exchange_token: refreshToken,
        });
        const res = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`);
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Meta refresh failed: ${body}`);
        }
        const json = (await res.json()) as { access_token: string; expires_in?: number };
        return {
          accessToken: json.access_token,
          refreshToken: null,
          expiresAt: json.expires_in ? new Date(Date.now() + json.expires_in * 1000).toISOString() : null,
        };
      }
    default:
      throw new Error('Unsupported platform');
  }
}
