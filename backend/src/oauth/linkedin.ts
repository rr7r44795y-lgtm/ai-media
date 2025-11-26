import { OAuthTokenResult } from '../types.js';

export function buildLinkedInAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'w_member_social r_liteprofile',
    state,
  });
  return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
}

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  refresh_token?: string;
}

export async function exchangeLinkedInCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenResult[]> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    redirect_uri: redirectUri,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn token exchange failed: ${body}`);
  }

  const tokenJson = (await res.json()) as LinkedInTokenResponse;
  const expiresAt = new Date(Date.now() + tokenJson.expires_in * 1000).toISOString();

  const profileRes = await fetch('https://api.linkedin.com/v2/me', {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });

  if (!profileRes.ok) {
    const body = await profileRes.text();
    throw new Error(`Unable to fetch LinkedIn profile: ${body}`);
  }

  const profile = (await profileRes.json()) as { id?: string };
  const externalId = profile.id || 'linkedin-user';

  return [
    {
      platform: 'linkedin',
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token || null,
      expiresAt,
      externalId,
    },
  ];
}

export async function refreshLinkedInToken(
  refreshToken: string,
  clientId: string,
  clientSecret: string
): Promise<{ accessToken: string; refreshToken?: string | null; expiresAt?: string | null }> {
  const params = new URLSearchParams({
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
  });

  const res = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`LinkedIn refresh failed: ${body}`);
  }

  const json = (await res.json()) as LinkedInTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || null,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
