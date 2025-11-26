import { supabaseService } from '../utils/supabaseClient.js';
import { decryptToken } from '../utils/encryption.js';
import { publishInstagram } from '../platforms/instagram.js';
import { publishFacebook } from '../platforms/facebook.js';
import { publishLinkedIn } from '../platforms/linkedin.js';
import { publishYouTubeDraft } from '../platforms/youtube.js';
import { SocialAccount } from '../platforms/types.js';

export type PublishPlatform = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube_draft';

export interface PublishPayload {
  content_id: string;
  text: string;
  platform_text: string | { title: string; description: string };
  media_urls: string[];
  scheduled_time: string;
  social_account_id: string;
}

async function getAccount(id: string, userId: string): Promise<SocialAccount> {
  const { data, error } = await supabaseService
    .from('social_accounts')
    .select('*')
    .eq('id', id)
    .eq('user_id', userId)
    .maybeSingle();
  if (error || !data) throw new Error('Social account not found');
  decryptToken(data.access_token_encrypted); // validate decryptable
  return data as SocialAccount;
}

export async function publishPost(platform: PublishPlatform, payload: PublishPayload, userId: string) {
  const socialAccount = await getAccount(payload.social_account_id, userId);
  switch (platform) {
    case 'instagram_business':
      return publishInstagram({ platform_text: payload.platform_text as string, media_urls: payload.media_urls, socialAccount });
    case 'facebook_page':
      return publishFacebook({ platform_text: payload.platform_text as string, media_urls: payload.media_urls, socialAccount });
    case 'linkedin':
      return publishLinkedIn({ platform_text: payload.platform_text as string, media_urls: payload.media_urls, socialAccount });
    case 'youtube_draft':
      return publishYouTubeDraft({ platform_text: payload.platform_text as { title: string; description: string }, media_urls: payload.media_urls, socialAccount });
    default:
      throw new Error('Unsupported platform');
  }
}
