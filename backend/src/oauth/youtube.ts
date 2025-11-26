import { OAuthTokens } from './linkedin.js';

export function buildYouTubeAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly',
    access_type: 'offline',
    state,
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

export async function exchangeYouTubeCode(code: string): Promise<OAuthTokens> {
  return {
    accessToken: `yt_${code}`,
    refreshToken: `yt_refresh_${code}`,
    expiresAt: new Date(Date.now() + 3600_000).toISOString(),
    externalId: `youtube-channel-${code}`,
  };
}
