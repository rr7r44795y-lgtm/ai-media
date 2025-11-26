import React from 'react';

const platformMeta: Record<
  string,
  { label: string; color: string; bg: string; glyph: string }
> = {
  instagram_business: { label: 'Instagram', color: 'text-pink-600', bg: 'bg-pink-100', glyph: 'IG' },
  facebook_page: { label: 'Facebook', color: 'text-blue-600', bg: 'bg-blue-100', glyph: 'FB' },
  linkedin: { label: 'LinkedIn', color: 'text-sky-700', bg: 'bg-sky-100', glyph: 'LI' },
  youtube_draft: { label: 'YouTube', color: 'text-red-600', bg: 'bg-red-100', glyph: 'YT' },
};

export function PlatformIcon({ platform }: { platform: string }) {
  const meta = platformMeta[platform] || { label: platform, color: 'text-slate-700', bg: 'bg-slate-100', glyph: platform.slice(0, 2).toUpperCase() };
  return (
    <div className={`flex items-center gap-2 text-xs font-semibold ${meta.color}`}>
      <span className={`inline-flex h-6 w-6 items-center justify-center rounded-full ${meta.bg} ${meta.color}`}>
        {meta.glyph}
      </span>
      <span className="hidden sm:inline">{meta.label}</span>
    </div>
  );
}
