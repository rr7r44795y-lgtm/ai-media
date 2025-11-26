import { encryptToken } from '../utils/encryption.js';
import { OAuthTokens } from './linkedin.js';

export function buildInstagramAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'instagram_basic,pages_show_list',
    state,
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeInstagramCode(code: string): Promise<OAuthTokens> {
  // Placeholder for Page lookup and ig business account validation
  return {
    accessToken: encryptToken(`ig_${code}`),
    refreshToken: encryptToken(`ig_refresh_${code}`),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    externalId: `instagram-business-${code}`,
  };
}
