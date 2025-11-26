import { decryptToken } from '../utils/encryption.js';
import { SocialAccount } from './types.js';

export async function publishFacebook(payload: {
  platform_text: string;
  media_urls: string[];
  socialAccount: SocialAccount;
}): Promise<{ id: string }> {
  const accessToken = decryptToken(payload.socialAccount.access_token_encrypted);
  if (!accessToken) throw new Error('Missing access token');
  if (payload.platform_text.length > 20000) throw new Error('Facebook text too long');
  return { id: `fb_${Date.now()}` };
}
