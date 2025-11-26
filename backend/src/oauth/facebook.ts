import { encryptToken } from '../utils/encryption.js';
import { OAuthTokens } from './linkedin.js';

export function buildFacebookAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'pages_show_list,pages_read_engagement',
    state,
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

export async function exchangeFacebookCode(code: string): Promise<OAuthTokens> {
  return {
    accessToken: encryptToken(`fb_${code}`),
    refreshToken: encryptToken(`fb_refresh_${code}`),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    externalId: `facebook-page-${code}`,
  };
}
