import { stripEmojis } from '../utils/text.js';

export type PlatformKey = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube_draft';

const config = {
  instagram_business: {
    maxLength: 2200,
    cta: '👇 Follow us for more updates',
  },
  facebook_page: {
    maxLength: 63000,
    engagementQuestion: 'What do you think? Share below!'
  },
  linkedin: {
    maxLength: 3000,
    hashtags: ['#industry', '#insights', '#growth', '#strategy', '#teamwork'],
  },
  youtube_draft: {
    titleMax: 100,
    descriptionMax: 5000,
  },
  forbidden: ['election', 'vote', 'hate', '<', '>', 'script'],
};

function sanitize(text: string): string {
  let cleaned = text;
  for (const word of config.forbidden) {
    const re = new RegExp(word, 'gi');
    cleaned = cleaned.replace(re, '');
  }
  return cleaned.trim();
}

function foldParagraphs(text: string): string {
  return text
    .split(/\n+/)
    .map((p) => (p.length > 150 ? `${p.slice(0, 150)}...` : p))
    .join('\n');
}

function capitalizeSentences(text: string): string {
  return text.replace(/(^|[.!?]\s+)([a-z])/g, (match, prefix, letter) => `${prefix}${letter.toUpperCase()}`);
}

function addHashtags(text: string): string {
  const tags = config.linkedin.hashtags.slice(0, 5).join(' ');
  return `${text}\n\n${tags}`;
}

function formatInstagram(text: string): string {
  const sanitized = sanitize(text);
  const withBreaks = sanitized.replace(/\n{2,}/g, '\n\n');
  const truncated = withBreaks.length > config.instagram_business.maxLength
    ? `${withBreaks.slice(0, config.instagram_business.maxLength - 3)}...`
    : withBreaks;
  return `${truncated}\n${config.instagram_business.cta}`.trim();
}

function formatFacebook(text: string): string {
  const sanitized = sanitize(text);
  if (sanitized.length > config.facebook_page.maxLength) {
    return sanitized.slice(0, config.facebook_page.maxLength - 3) + '...';
  }
  const folded = foldParagraphs(sanitized);
  return `${folded}\n${config.facebook_page.engagementQuestion}`.trim();
}

function formatLinkedIn(text: string): string {
  const sanitized = sanitize(stripEmojis(text));
  const professional = capitalizeSentences(sanitized).replace(/\n{2,}/g, '\n\n');
  const truncated = professional.length > config.linkedin.maxLength
    ? `${professional.slice(0, config.linkedin.maxLength - 3)}...`
    : professional;
  return addHashtags(truncated);
}

function formatYouTube(text: string): { title: string; description: string } {
  const sanitized = sanitize(text);
  const sentences = sanitized.split(/(?<=[.!?])\s+/);
  const rawTitle = sentences[0] || sanitized;
  const title = rawTitle.slice(0, 80).trim();
  const descriptionBody = sanitized;
  let description = `Overview\n${descriptionBody}\n\nKey Points\n- ${descriptionBody.split(/\n+/).join('\n- ')}\n\nLinks & Credits\n`;
  if (description.length > config.youtube_draft.descriptionMax) {
    description = description.slice(0, config.youtube_draft.descriptionMax - 3) + '...';
  }
  return { title, description };
}

export function formatAdapter(platform: PlatformKey, text: string) {
  switch (platform) {
    case 'instagram_business':
      return formatInstagram(text);
    case 'facebook_page':
      return formatFacebook(text);
    case 'linkedin':
      return formatLinkedIn(text);
    case 'youtube_draft':
      return formatYouTube(text);
    default:
      throw new Error('Unsupported platform');
  }
}

export function formatMultiple(platforms: PlatformKey[], text: string) {
  const result: Record<string, unknown> = {};
  platforms.forEach((p) => {
    result[p] = formatAdapter(p, text);
  });
  return result;
}
