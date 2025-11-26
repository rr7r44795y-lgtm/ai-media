import { OAuthTokenResult } from '../types.js';

export function buildInstagramAuthUrl(state: string, redirect: string, clientId: string) {
  const params = new URLSearchParams({
    response_type: 'code',
    client_id: clientId,
    redirect_uri: redirect,
    scope: 'instagram_basic,instagram_content_publish,pages_show_list,pages_read_engagement',
    state,
  });
  return `https://www.facebook.com/v20.0/dialog/oauth?${params.toString()}`;
}

interface MetaAccessTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
}

interface MetaPageRecord {
  id: string;
  access_token?: string;
  instagram_business_account?: { id: string } | null;
}

async function exchangeForLongLivedToken(params: URLSearchParams): Promise<MetaAccessTokenResponse> {
  const res = await fetch(`https://graph.facebook.com/v20.0/oauth/access_token?${params.toString()}`);
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Instagram token exchange failed: ${body}`);
  }
  return (await res.json()) as MetaAccessTokenResponse;
}

export async function exchangeInstagramCode(
  code: string,
  redirectUri: string,
  clientId: string,
  clientSecret: string
): Promise<OAuthTokenResult[]> {
  const shortParams = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });
  const shortToken = await exchangeForLongLivedToken(shortParams);

  const longParams = new URLSearchParams({
    grant_type: 'fb_exchange_token',
    client_id: clientId,
    client_secret: clientSecret,
    fb_exchange_token: shortToken.access_token,
  });
  const longToken = await exchangeForLongLivedToken(longParams);

  const expiresAt = longToken.expires_in ? new Date(Date.now() + longToken.expires_in * 1000) : null;

  const pagesRes = await fetch(
    `https://graph.facebook.com/v20.0/me/accounts?fields=id,access_token,instagram_business_account&access_token=${encodeURIComponent(
      longToken.access_token
    )}`
  );

  if (!pagesRes.ok) {
    const body = await pagesRes.text();
    throw new Error(`Unable to load Instagram business accounts: ${body}`);
  }

  const pagesJson = (await pagesRes.json()) as { data?: MetaPageRecord[] };
  const pages = pagesJson.data || [];

  return pages
    .filter((page) => page.instagram_business_account?.id)
    .map<OAuthTokenResult>((page) => ({
      platform: 'instagram_business',
      access_token: page.access_token || longToken.access_token,
      refresh_token: null,
      expires_at: expiresAt,
      external_account_id: page.instagram_business_account!.id,
    }));
}
