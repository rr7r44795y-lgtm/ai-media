import { decryptToken } from '../utils/encryption.js';
import { SocialAccount } from './types.js';

export async function publishInstagram(payload: {
  platform_text: string;
  media_urls: string[];
  socialAccount: SocialAccount;
}): Promise<{ id: string }> {
  const accessToken = decryptToken(payload.socialAccount.access_token_encrypted);
  if (!accessToken) throw new Error('Missing access token');
  if (payload.platform_text.length > 2200) throw new Error('Instagram text too long');
  // Placeholder for actual Instagram publishing logic
  return { id: `ig_${Date.now()}` };
}
