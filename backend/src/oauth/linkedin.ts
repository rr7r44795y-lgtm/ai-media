import { encryptToken } from '../utils/encryption.js';

export interface OAuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
  externalId: string;
}

export function buildLinkedInAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'w_member_social',
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

export async function exchangeLinkedInCode(code: string): Promise<OAuthTokens> {
  // In production, call LinkedIn token endpoint. Placeholder here.
  return {
    accessToken: encryptToken(`li_${code}`),
    refreshToken: encryptToken(`li_refresh_${code}`),
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    externalId: `linkedin-user-${code}`,
  };
}
