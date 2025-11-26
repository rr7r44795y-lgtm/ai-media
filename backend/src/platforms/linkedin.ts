import { decryptToken } from '../utils/encryption.js';
import { SocialAccount } from './types.js';

export async function publishLinkedIn(payload: {
  platform_text: string;
  media_urls: string[];
  socialAccount: SocialAccount;
}): Promise<{ id: string }> {
  const accessToken = decryptToken(payload.socialAccount.access_token_encrypted);
  if (!accessToken) throw new Error('Missing access token');
  if (payload.platform_text.length > 3000) throw new Error('LinkedIn text too long');
  return { id: `li_${Date.now()}` };
}
