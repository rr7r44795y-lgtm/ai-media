import { decryptToken } from '../utils/encryption.js';
import { FacebookPublishResult } from '../types.js';
import { SocialAccount } from './types.js';

const GRAPH_VERSION = 'v20.0';

class FacebookPublishError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'FacebookPublishError';
  }
}

const ensureAccessToken = (socialAccount: SocialAccount, providedToken?: string): string => {
  const token = providedToken || decryptToken(socialAccount.access_token_encrypted);
  if (!token) {
    throw new FacebookPublishError('oauth_exception', 'Missing access token');
  }
  return token;
};

const validateMediaUrl = (url?: string): string => {
  if (!url) {
    throw new FacebookPublishError('invalid_media', 'Missing media URL');
  }
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('Invalid protocol');
    }
    return url;
  } catch (err) {
    throw new FacebookPublishError('invalid_media', 'Invalid media URL');
  }
};

const isVideoUrl = (url: string): boolean => {
  const clean = url.split('?')[0]?.toLowerCase() ?? '';
  return /\.(mp4|mov|m4v|avi|mkv|webm)$/.test(clean);
};

const mapGraphError = (error: any): never => {
  const message = error?.error?.message || 'Facebook API error';
  const code = error?.error?.code as number | undefined;
  const subcode = error?.error?.error_subcode as number | undefined;
  const status = error?.error?.status as number | undefined;
  const lowerMessage = typeof message === 'string' ? message.toLowerCase() : '';

  let mappedCode = 'graph_error';

  if (code === 190) {
    mappedCode = 'oauth_exception';
  } else if (code === 10 || code === 200 || code === 298) {
    mappedCode = 'permission_error';
  } else if ((typeof status === 'number' && status >= 400 && status < 500) || (typeof code === 'number' && code >= 400 && code < 500)) {
    mappedCode = 'graph_error';
  }

  if (code === 100 || subcode === 33 || lowerMessage.includes('url')) {
    mappedCode = 'invalid_media';
  }

  throw new FacebookPublishError(mappedCode, message);
};

const uploadMedia = async (
  pageId: string,
  accessToken: string,
  mediaUrl: string,
  message: string
): Promise<string> => {
  const isVideo = isVideoUrl(mediaUrl);
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/${isVideo ? 'videos' : 'photos'}`;
  const params = new URLSearchParams();

  if (isVideo) {
    params.set('file_url', mediaUrl);
    params.set('description', message || '');
  } else {
    params.set('url', mediaUrl);
    params.set('caption', message || '');
  }

  params.set('access_token', accessToken);
  params.set('published', 'false');

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    mapGraphError(data);
  }

  return data.id as string;
};

const publishFeedPost = async (
  pageId: string,
  accessToken: string,
  message: string,
  mediaId?: string
): Promise<string> => {
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${pageId}/feed`;
  const params = new URLSearchParams();

  if (message) {
    params.set('message', message);
  }

  if (mediaId) {
    params.set('attached_media', JSON.stringify([{ media_fbid: mediaId }]));
  }

  params.set('access_token', accessToken);

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    mapGraphError(data);
  }

  return data.id as string;
};

const fetchPermalink = async (postId: string, accessToken: string): Promise<string> => {
  const endpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${postId}?fields=permalink_url&access_token=${encodeURIComponent(accessToken)}`;
  const response = await fetch(endpoint);
  const data = await response.json().catch(() => ({}));

  if (!response.ok || !data?.permalink_url) {
    mapGraphError(data);
  }

  return data.permalink_url as string;
};

export async function publishFacebookPage(payload: {
  platform_text: string;
  media_urls: string[];
  socialAccount: SocialAccount;
  accessToken?: string;
}): Promise<FacebookPublishResult> {
  const { platform_text, media_urls, socialAccount, accessToken: providedToken } = payload;

  if (socialAccount.platform !== 'facebook_page') {
    throw new FacebookPublishError('invalid_account', 'Invalid platform for Facebook Page publishing');
  }

  const pageId = socialAccount.external_account_id;
  if (!pageId) {
    throw new FacebookPublishError('invalid_account', 'Missing page id');
  }

  const accessToken = ensureAccessToken(socialAccount, providedToken);
  const message = typeof platform_text === 'string' ? platform_text : '';
  const mediaUrl = media_urls?.[0];
  let mediaId: string | undefined;

  if (mediaUrl) {
    const validatedUrl = validateMediaUrl(mediaUrl);
    mediaId = await uploadMedia(pageId, accessToken, validatedUrl, message);
  }

  const postId = await publishFeedPost(pageId, accessToken, message, mediaId);
  const permalink = await fetchPermalink(postId, accessToken);

  return {
    media_id: mediaId,
    post_id: postId,
    permalink_url: permalink,
  };
}
