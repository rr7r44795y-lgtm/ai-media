import { getClient } from './supabaseClient';
import { SocialAccount } from './types';

async function getAuthToken(providedToken?: string): Promise<string> {
  if (providedToken) return providedToken;
  const supabase = getClient();
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) {
    throw new Error('Not authenticated');
  }
  return token;
}

export async function listSocialAccounts(token?: string): Promise<SocialAccount[]> {
  const authToken = await getAuthToken(token);
  const res = await fetch('/api/oauth/accounts', {
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to load social accounts');
  }
  return res.json();
}

export async function disconnectSocialAccount(id: string, token?: string): Promise<void> {
  const authToken = await getAuthToken(token);
  const res = await fetch(`/api/oauth/accounts/${id}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${authToken}` },
  });
  if (!res.ok) {
    throw new Error('Failed to disconnect social account');
  }
}
