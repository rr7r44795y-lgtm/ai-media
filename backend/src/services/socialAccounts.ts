import { SocialPlatform } from '../types.js';

export const SUPPORTED_SOCIAL_PLATFORMS: SocialPlatform[] = [
  'instagram_business',
  'facebook_page',
  'linkedin',
  'youtube_draft',
];

export function isSupportedSocialPlatform(value: string): value is SocialPlatform {
  return SUPPORTED_SOCIAL_PLATFORMS.includes(value as SocialPlatform);
}
