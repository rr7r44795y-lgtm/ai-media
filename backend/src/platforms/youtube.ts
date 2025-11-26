import { decryptToken } from '../utils/encryption.js';
import { refreshIfExpired } from '../utils/refreshToken.js';
import { SocialAccount } from './types.js';
import { YouTubePublishResult } from '../types.js';

interface YouTubeDraftPayload {
  platform_text: { title: string; description: string };
  media_urls: string[];
  socialAccount: SocialAccount;
  accessToken?: string;
}

const YOUTUBE_UPLOAD_URL =
  'https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status';

function mapYouTubeError(status: number, defaultMessage: string): Error {
  switch (status) {
    case 400:
      return new Error('youtube_invalid_metadata');
    case 401:
      return new Error('youtube_invalid_token');
    case 403:
      return new Error('youtube_insufficient_permissions');
    case 404:
      return new Error('youtube_channel_not_found');
    default:
      return new Error(defaultMessage);
  }
}

export async function publishYouTubeDraft(payload: YouTubeDraftPayload): Promise<YouTubePublishResult> {
  if (!payload.media_urls || !payload.media_urls.length) {
    throw new Error('youtube_missing_media');
  }

  const { socialAccount } = payload;
  const refreshResult = await refreshIfExpired(socialAccount.id);
  if (refreshResult.error) {
    throw new Error('youtube_token_refresh_failed');
  }

  const accessToken =
    payload.accessToken || refreshResult.accessToken || decryptToken(socialAccount.access_token_encrypted);
  if (!accessToken) {
    throw new Error('youtube_missing_access_token');
  }

  const { title, description } = payload.platform_text || {};
  if (!title || title.length > 100) {
    throw new Error('youtube_invalid_title');
  }
  if (description && description.length > 5000) {
    throw new Error('youtube_description_too_long');
  }

  const mediaUrl = payload.media_urls[0];
  const mediaResponse = await fetch(mediaUrl);
  if (!mediaResponse.ok) {
    throw new Error('youtube_media_download_failed');
  }

  const contentType = mediaResponse.headers.get('content-type') || 'video/mp4';
  const arrayBuffer = await mediaResponse.arrayBuffer();
  const videoBuffer = Buffer.from(arrayBuffer);
  const contentLength = videoBuffer.byteLength;

  const startResponse = await fetch(YOUTUBE_UPLOAD_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': contentType,
      'X-Upload-Content-Length': contentLength.toString(),
    },
    body: JSON.stringify({
      snippet: {
        title,
        description: description || '',
      },
      status: {
        privacyStatus: 'private',
      },
    }),
  });

  if (!startResponse.ok) {
    throw mapYouTubeError(startResponse.status, 'youtube_upload_session_failed');
  }

  const uploadUrl = startResponse.headers.get('location');
  if (!uploadUrl) {
    throw new Error('youtube_upload_url_missing');
  }

  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Content-Length': contentLength.toString(),
      'Content-Type': contentType,
    },
    body: videoBuffer,
  });

  if (uploadResponse.status === 308) {
    throw new Error('youtube_upload_incomplete');
  }

  if (!uploadResponse.ok) {
    throw mapYouTubeError(uploadResponse.status, 'youtube_upload_failed');
  }

  let data: { id?: string } = {};
  try {
    data = (await uploadResponse.json()) as { id?: string };
  } catch (e) {
    // ignore JSON parse errors for responses without body
  }

  const videoId = data.id;
  if (!videoId) {
    throw new Error('youtube_missing_video_id');
  }

  return { videoId, published_url: `https://www.youtube.com/watch?v=${videoId}` };
}
