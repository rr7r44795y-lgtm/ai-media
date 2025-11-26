import { decryptToken, encryptToken } from '../utils/encryption.js';
import { supabaseService } from '../utils/supabaseClient.js';
import { RefreshError, SocialPlatform } from '../types.js';

interface RefreshInput {
  id: string;
  platform: SocialPlatform;
  access_token_encrypted: string | null;
  refresh_token_encrypted?: string | null;
  expires_at?: string | null;
}

interface RefreshResult {
  access_token: string;
  refresh_token?: string | null;
  expires_at: Date | null;
}

function requireEnv(key: string, platform: SocialPlatform): string {
  const value = process.env[key];
  if (!value) {
    throw new RefreshError(platform, `${key} is not configured`, false);
  }
  return value;
}

async function refreshMeta(platform: SocialPlatform, accessToken?: string | null): Promise<RefreshResult> {
  if (!accessToken) {
    throw new RefreshError(platform, 'missing_access_token', false);
  }

  const clientId = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_ID`, platform);
  const clientSecret = requireEnv(`OAUTH_${platform.toUpperCase()}_CLIENT_SECRET`, platform);

  const params = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: accessToken,
  });

  const res = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new RefreshError(platform, `Meta token refresh failed: ${body}`, res.status >= 500);
  }

  const json = (await res.json()) as { access_token: string; expires_in?: number };
  const expiresAt = json.expires_in ? new Date(Date.now() + json.expires_in * 1000) : null;
  return { access_token: json.access_token, refresh_token: null, expires_at: expiresAt };
}

async function refreshLinkedIn(refreshToken?: string | null): Promise<RefreshResult> {
  if (!refreshToken) {
    throw new RefreshError('linkedin', 'missing_refresh_token', false);
  }

  const clientId = requireEnv('OAUTH_LINKEDIN_CLIENT_ID', 'linkedin');
  const clientSecret = requireEnv('OAUTH_LINKEDIN_CLIENT_SECRET', 'linkedin');

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
    throw new RefreshError('linkedin', `LinkedIn refresh failed: ${body}`, res.status >= 500);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || refreshToken,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
  };
}

async function refreshYouTube(refreshToken?: string | null): Promise<RefreshResult> {
  if (!refreshToken) {
    throw new RefreshError('youtube_draft', 'missing_refresh_token', false);
  }

  const clientId = requireEnv('OAUTH_YOUTUBE_DRAFT_CLIENT_ID', 'youtube_draft');
  const clientSecret = requireEnv('OAUTH_YOUTUBE_DRAFT_CLIENT_SECRET', 'youtube_draft');

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
    throw new RefreshError('youtube_draft', `YouTube refresh failed: ${body}`, res.status >= 500);
  }

  const json = (await res.json()) as { access_token: string; expires_in: number; refresh_token?: string };
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token || refreshToken,
    expires_at: new Date(Date.now() + json.expires_in * 1000),
  };
}

export async function refreshSocialAccount(account: RefreshInput): Promise<RefreshResult> {
  const accessToken = account.access_token_encrypted ? decryptToken(account.access_token_encrypted) : null;
  const refreshToken = account.refresh_token_encrypted ? decryptToken(account.refresh_token_encrypted) : null;

  switch (account.platform) {
    case 'facebook_page':
    case 'instagram_business':
      return refreshMeta(account.platform, accessToken);
    case 'linkedin':
      return refreshLinkedIn(refreshToken);
    case 'youtube_draft':
      return refreshYouTube(refreshToken);
    default:
      throw new RefreshError(account.platform, 'unsupported_platform', false);
  }
}

export async function persistRefreshedTokens(
  accountId: string,
  refreshed: RefreshResult,
  platform: SocialPlatform
) {
  const updatePayload: Record<string, string | null> = {
    access_token_encrypted: encryptToken(refreshed.access_token),
    expires_at: refreshed.expires_at ? refreshed.expires_at.toISOString() : null,
  };

  if (refreshed.refresh_token !== undefined) {
    updatePayload.refresh_token_encrypted = refreshed.refresh_token ? encryptToken(refreshed.refresh_token) : null;
  }

  const { error } = await supabaseService
    .from('social_accounts')
    .update(updatePayload)
    .eq('id', accountId);

  if (error) {
    throw new RefreshError(platform, `failed_to_persist_tokens: ${error.message}`, true);
  }
}
