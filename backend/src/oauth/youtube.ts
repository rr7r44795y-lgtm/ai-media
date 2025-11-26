import { OAuthTokenResult } from '../types.js';

export function buildYouTubeAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline',
    prompt: 'consent',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

interface GoogleTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}

export async function exchangeYouTubeCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenResult[]> {
  const params = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
  });

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube token exchange failed: ${body}`);
  }

  const json = (await res.json()) as GoogleTokenResponse;
  const expiresAt = new Date(Date.now() + json.expires_in * 1000).toISOString();

  const profileRes = await fetch('https://www.googleapis.com/youtube/v3/channels?part=id&mine=true', {
    headers: { Authorization: `Bearer ${json.access_token}` },
  });

  if (!profileRes.ok) {
    const body = await profileRes.text();
    throw new Error(`Unable to fetch YouTube channel: ${body}`);
  }

  const profileJson = (await profileRes.json()) as { items?: { id: string }[] };
  const externalId = profileJson.items?.[0]?.id || 'youtube-channel';

  return [
    {
      platform: 'youtube_draft',
      accessToken: json.access_token,
      refreshToken: json.refresh_token || null,
      expiresAt,
      externalId,
      scopes: json.scope ? json.scope.split(' ') : undefined,
    },
  ];
}

export async function refreshYouTubeToken(
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

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`YouTube refresh failed: ${body}`);
  }

  const json = (await res.json()) as GoogleTokenResponse;
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token || refreshToken,
    expiresAt: new Date(Date.now() + json.expires_in * 1000).toISOString(),
  };
}
