import { decryptToken } from '../utils/encryption.js';
import { SocialAccount } from './types.js';

export async function publishYouTubeDraft(payload: {
  platform_text: { title: string; description: string };
  media_urls: string[];
  socialAccount: SocialAccount;
}): Promise<{ id: string }> {
  const accessToken = decryptToken(payload.socialAccount.access_token_encrypted);
  if (!accessToken) throw new Error('Missing access token');
  if (!payload.platform_text.title || payload.platform_text.title.length > 100) {
    throw new Error('Invalid YouTube title');
  }
  if (payload.platform_text.description.length > 5000) throw new Error('YouTube description too long');
  return { id: `yt_${Date.now()}` };
}
