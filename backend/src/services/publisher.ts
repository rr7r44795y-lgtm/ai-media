import { supabaseService } from '../utils/supabaseClient.js';
import { decryptToken } from '../utils/encryption.js';
import { publishInstagramBusiness } from '../platforms/instagram.js';
import { publishFacebookPage } from '../platforms/facebook.js';
import { publishLinkedIn } from '../platforms/linkedin.js';
import { publishYouTubeDraft } from '../platforms/youtube.js';
import { SocialAccount } from '../platforms/types.js';
import { RefreshError, ScheduleRecord } from '../types.js';
import { refreshIfExpired } from '../utils/refreshToken.js';

export type PublishPlatform = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube_draft';

const validPlatforms: PublishPlatform[] = ['instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'];

export class PublisherError extends Error {
  constructor(public code: string) {
    super(code);
    this.name = 'PublisherError';
  }
}

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
  if (error || !data) throw new PublisherError('social_account_not_found');
  decryptToken(data.access_token_encrypted); // validate decryptable
  return data as SocialAccount;
}

export async function validateScheduleForPublish(scheduleId: string): Promise<{ schedule: ScheduleRecord; account: SocialAccount }> {
  const { data, error } = await supabaseService.from('schedules').select('*').eq('id', scheduleId).maybeSingle();
  if (error || !data) {
    throw new PublisherError('not_found');
  }

  const schedule = data as ScheduleRecord & { social_account_id?: string };
  if (schedule.status === 'cancelled') {
    throw new PublisherError('cancelled');
  }
  if (schedule.status === 'success') {
    throw new PublisherError('already_published');
  }
  if (!validPlatforms.includes(schedule.platform as PublishPlatform)) {
    throw new PublisherError('invalid_platform');
  }

  const socialAccountId = schedule.social_account_id;
  if (!socialAccountId) {
    throw new PublisherError('social_account_missing');
  }

  const { data: account, error: accountErr } = await supabaseService
    .from('social_accounts')
    .select('*')
    .eq('id', socialAccountId)
    .maybeSingle();

  if (accountErr || !account) {
    throw new PublisherError('social_account_not_found');
  }

  if (account.user_id !== schedule.user_id) {
    throw new PublisherError('forbidden');
  }

  return { schedule, account: account as SocialAccount };
}

export async function publishPost(platform: PublishPlatform, payload: PublishPayload, userId: string) {
  const socialAccount = await getAccount(payload.social_account_id, userId);
  let refreshed;
  try {
    refreshed = await refreshIfExpired(socialAccount.id);
  } catch (err) {
    if (err instanceof RefreshError) {
      throw err;
    }
    throw new PublisherError('token_refresh_failed');
  }

  const accessToken = refreshed.access_token;

  if (!accessToken) {
    throw new PublisherError('missing_access_token');
  }

  switch (platform) {
    case 'instagram_business': {
      const ig = await publishInstagramBusiness({
        platform_text: payload.platform_text as string,
        media_urls: payload.media_urls,
        socialAccount,
        accessToken,
      });
      return { success: true, url: ig.permalink };
    }
    case 'facebook_page': {
      if (socialAccount.platform !== 'facebook_page') {
        throw new PublisherError('invalid_platform');
      }

      const fb = await publishFacebookPage({
        platform_text: payload.platform_text as string,
        media_urls: payload.media_urls,
        socialAccount,
        accessToken,
      });

      return { success: true, url: fb.permalink_url };
    }
    case 'linkedin': {
      if (socialAccount.platform !== 'linkedin') {
        throw new PublisherError('invalid_platform');
      }

      const li = await publishLinkedIn({
        platform_text: payload.platform_text as string,
        media_urls: payload.media_urls,
        socialAccount,
        accessToken,
      });
      return { success: true, url: li.published_url };
    }
    case 'youtube_draft': {
      const yt = await publishYouTubeDraft({
        platform_text: payload.platform_text as { title: string; description: string },
        media_urls: payload.media_urls,
        socialAccount,
        accessToken,
      });
      return { success: true, url: yt.published_url };
    }
    default:
      throw new PublisherError('invalid_platform');
  }
}
