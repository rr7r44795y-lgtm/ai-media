import { decryptToken } from '../utils/encryption.js';
import { InstagramPublishResult } from '../types.js';
import { SocialAccount } from './types.js';

const GRAPH_VERSION = 'v20.0';

class InstagramPublishError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'InstagramPublishError';
  }
}

const mapGraphError = (error: any): never => {
  const message = error?.error?.message || 'Instagram API error';
  const code = error?.error?.code as number | undefined;
  const subcode = error?.error?.error_subcode as number | undefined;
  const lowerMessage = typeof message === 'string' ? message.toLowerCase() : '';

  let mappedCode = 'unknown';

  if (code === 190) {
    mappedCode = 'token_expired';
  } else if (code === 4 || code === 17 || code === 341) {
    mappedCode = 'rate_limit';
  } else if (code === 10 || code === 200 || code === 298 || subcode === 33) {
    mappedCode = 'permission_error';
  } else if (code === 100 || lowerMessage.includes('media') || lowerMessage.includes('image_url') || lowerMessage.includes('video_url')) {
    mappedCode = 'invalid_media';
  } else if (code === 803 || code === 2500) {
    mappedCode = 'invalid_account';
  }

  throw new InstagramPublishError(mappedCode, message);
};

const ensureAccessToken = (socialAccount: SocialAccount, providedToken?: string): string => {
  const token = providedToken || decryptToken(socialAccount.access_token_encrypted);
  if (!token) {
    throw new InstagramPublishError('token_expired', 'Missing access token');
  }
  return token;
};

const isVideoUrl = (url: string): boolean => {
  const cleanUrl = url.split('?')[0]?.toLowerCase() || '';
  return /\.(mp4|mov|m4v|avi|mkv|webm)$/.test(cleanUrl);
};

export async function publishInstagramBusiness(payload: {
  platform_text: string;
  media_urls: string[];
  socialAccount: SocialAccount;
  accessToken?: string;
}): Promise<InstagramPublishResult> {
  const { platform_text, media_urls, socialAccount } = payload;

  if (socialAccount.platform !== 'instagram_business') {
    throw new InstagramPublishError('invalid_account', 'Invalid platform for Instagram Business publishing');
  }

  const igBusinessId = socialAccount.external_account_id;
  if (!igBusinessId) {
    throw new InstagramPublishError('invalid_account', 'Missing Instagram business account id');
  }

  const mediaUrl = media_urls?.[0];
  if (!mediaUrl) {
    throw new InstagramPublishError('invalid_media', 'Missing media URL');
  }

  if (platform_text && platform_text.length > 2200) {
    throw new InstagramPublishError('invalid_media', 'Instagram caption exceeds limit');
  }

  const accessToken = ensureAccessToken(socialAccount, payload.accessToken);
  const mediaEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${igBusinessId}/media`;
  const publishEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${igBusinessId}/media_publish`;

  const mediaParams = new URLSearchParams();
  mediaParams.set('caption', platform_text || '');
  mediaParams.set('access_token', accessToken);

  if (isVideoUrl(mediaUrl)) {
    mediaParams.set('media_type', 'VIDEO');
    mediaParams.set('video_url', mediaUrl);
  } else {
    mediaParams.set('image_url', mediaUrl);
  }

  const mediaResponse = await fetch(mediaEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: mediaParams.toString(),
  });

  const mediaData = await mediaResponse.json().catch(() => ({}));
  if (!mediaResponse.ok || !mediaData?.id) {
    mapGraphError(mediaData);
  }

  const containerId: string = mediaData.id;

  const publishParams = new URLSearchParams();
  publishParams.set('creation_id', containerId);
  publishParams.set('access_token', accessToken);

  const publishResponse = await fetch(publishEndpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: publishParams.toString(),
  });

  const publishData = await publishResponse.json().catch(() => ({}));
  if (!publishResponse.ok || !publishData?.id) {
    mapGraphError(publishData);
  }

  const mediaId: string = publishData.id;
  const permalinkResponse = await fetch(
    `https://graph.facebook.com/${GRAPH_VERSION}/${mediaId}?fields=permalink&access_token=${encodeURIComponent(accessToken)}`
  );
  const permalinkData = await permalinkResponse.json().catch(() => ({}));
  if (!permalinkResponse.ok || !permalinkData?.permalink) {
    mapGraphError(permalinkData);
  }

  return {
    container_id: containerId,
    media_id: mediaId,
    permalink: permalinkData.permalink as string,
  };
}
