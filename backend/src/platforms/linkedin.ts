import { LinkedInPublishResult } from '../types.js';
import { decryptToken } from '../utils/encryption.js';
import { SocialAccount } from './types.js';

const LINKEDIN_VERSION = '202404';

class LinkedInPublishError extends Error {
  constructor(public code: string, message: string) {
    super(message);
    this.name = 'LinkedInPublishError';
  }
}

const ensureAccessToken = (socialAccount: SocialAccount, providedToken?: string): string => {
  const token = providedToken || decryptToken(socialAccount.access_token_encrypted);
  if (!token) {
    throw new LinkedInPublishError('missing_access_token', 'Missing access token');
  }
  return token;
};

const validateAuthor = (socialAccount: SocialAccount): string => {
  if (socialAccount.platform !== 'linkedin') {
    throw new LinkedInPublishError('invalid_platform', 'Invalid LinkedIn account');
  }

  const author = socialAccount.external_account_id;
  if (!author || !author.startsWith('urn:li:')) {
    throw new LinkedInPublishError('invalid_author', 'Missing or invalid LinkedIn author');
  }
  return author;
};

const mapLinkedInError = async (response: Response): Promise<never> => {
  let message = 'LinkedIn API error';
  try {
    const data = await response.json();
    if (data?.message) {
      message = data.message as string;
    }
  } catch (err) {
    // ignore parse errors
  }

  if (response.status === 401) {
    throw new LinkedInPublishError('unauthorized', message);
  }
  if (response.status === 403) {
    throw new LinkedInPublishError('forbidden', message);
  }

  throw new LinkedInPublishError('api_error', message);
};

const registerUpload = async (owner: string, accessToken: string): Promise<{ uploadUrl: string; asset: string }> => {
  const body = {
    registerUploadRequest: {
      owner,
      recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
      serviceRelationships: [
        {
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        },
      ],
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    await mapLinkedInError(response);
  }

  const uploadUrl = data?.value?.uploadMechanism?.mediaUploadHttpRequest?.uploadUrl as string | undefined;
  const asset = data?.value?.asset as string | undefined;
  if (!uploadUrl || !asset) {
    throw new LinkedInPublishError('upload_registration_failed', 'Failed to register LinkedIn upload');
  }

  return { uploadUrl, asset };
};

const uploadMedia = async (uploadUrl: string, mediaUrl: string): Promise<void> => {
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new LinkedInPublishError('media_fetch_failed', 'Failed to fetch media for LinkedIn upload');
  }

  const buffer = Buffer.from(await mediaResponse.arrayBuffer());
  const contentType = mediaResponse.headers.get('content-type') || 'application/octet-stream';

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Type': contentType,
      'Content-Length': buffer.byteLength.toString(),
    },
    body: buffer,
  });

  if (!uploadResponse.ok) {
    await mapLinkedInError(uploadResponse);
  }
};

const createUgcPost = async (
  author: string,
  text: string,
  accessToken: string,
  asset?: string
): Promise<LinkedInPublishResult> => {
  const hasMedia = Boolean(asset);
  const specificContent: Record<string, any> = {
    'com.linkedin.ugc.ShareContent': {
      shareCommentary: { text },
      shareMediaCategory: hasMedia ? 'IMAGE' : 'NONE',
      ...(hasMedia
        ? {
            media: [
              {
                status: 'READY',
                media: asset,
              },
            ],
          }
        : {}),
    },
  };

  const body = {
    author,
    lifecycleState: 'PUBLISHED',
    specificContent,
    visibility: {
      'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
    },
  };

  const response = await fetch('https://api.linkedin.com/v2/ugcPosts', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data?.id) {
    await mapLinkedInError(response);
  }

  const postUrn = data.id as string;
  const publishedUrl = `https://www.linkedin.com/feed/update/${postUrn}`;

  return {
    asset,
    post_urn: postUrn,
    published_url: publishedUrl,
  };
};

export async function publishLinkedIn(payload: {
  platform_text: string;
  media_urls: string[];
  socialAccount: SocialAccount;
  accessToken?: string;
}): Promise<LinkedInPublishResult> {
  const { platform_text, media_urls, socialAccount, accessToken: providedToken } = payload;

  const author = validateAuthor(socialAccount);
  const accessToken = ensureAccessToken(socialAccount, providedToken);
  const text = platform_text || '';

  if (text.length > 3000) {
    throw new LinkedInPublishError('text_too_long', 'LinkedIn text exceeds limit');
  }

  const mediaUrl = media_urls?.[0];
  let asset: string | undefined;

  if (mediaUrl) {
    const { uploadUrl, asset: registeredAsset } = await registerUpload(author, accessToken);
    await uploadMedia(uploadUrl, mediaUrl);
    asset = registeredAsset;
  }

  return createUgcPost(author, text, accessToken, asset);
}
