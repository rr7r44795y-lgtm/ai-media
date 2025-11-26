'use client';

import { useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import { getClient } from '../../lib/supabaseClient';

type PlatformKey = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube_draft';

interface PlatformText {
  instagram_business: string;
  facebook_page: string;
  linkedin: string;
  youtube_draft: { title: string; description: string };
}

const platforms: { id: PlatformKey; label: string }[] = [
  { id: 'instagram_business', label: 'Instagram Business' },
  { id: 'facebook_page', label: 'Facebook Page' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube_draft', label: 'YouTube Draft' },
];

interface ContentRow {
  id: string;
  type: string;
  text: string | null;
  url: string;
}

export default function SchedulePage() {
  const supabase = getClient();
  const [session, setSession] = useState<Session | null>(null);
  const [contents, setContents] = useState<ContentRow[]>([]);
  const [selectedContent, setSelectedContent] = useState<string>('');
  const [unifiedText, setUnifiedText] = useState('');
  const [platformTexts, setPlatformTexts] = useState<PlatformText>({
    instagram_business: '',
    facebook_page: '',
    linkedin: '',
    youtube_draft: { title: '', description: '' },
  });
  const [selectedPlatforms, setSelectedPlatforms] = useState<PlatformKey[]>([
    'instagram_business',
    'facebook_page',
  ]);
  const [scheduledTimes, setScheduledTimes] = useState<Record<string, string>>({});
  const [suggestions] = useState<Record<string, string>>({
    instagram_business: new Date(Date.now() + 3600_000).toISOString().slice(0, 16),
    facebook_page: new Date(Date.now() + 5400_000).toISOString().slice(0, 16),
    linkedin: new Date(Date.now() + 7200_000).toISOString().slice(0, 16),
    youtube_draft: new Date(Date.now() + 9000_000).toISOString().slice(0, 16),
  });

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  const token = useMemo(() => session?.access_token, [session]);

  useEffect(() => {
    if (!token) return;
    fetch('/api/content/list', { headers: { Authorization: `Bearer ${token}` } })
      .then((res) => res.json())
      .then((data: ContentRow[]) => setContents(data || []));
  }, [token]);

  const generateFormats = async () => {
    if (!token) return;
    const res = await fetch('/api/format/generate', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        unified_text: unifiedText,
        platforms: ['instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'],
      }),
    });
    const data = await res.json();
    setPlatformTexts({
      instagram_business: data.instagram_business || '',
      facebook_page: data.facebook_page || '',
      linkedin: data.linkedin || '',
      youtube_draft: data.youtube_draft || { title: '', description: '' },
    });
  };

  const togglePlatform = (id: PlatformKey) => {
    setSelectedPlatforms((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  };

  const submit = async () => {
    if (!token || !selectedContent) return;
    const payload = {
      content_id: selectedContent,
      unified_text: unifiedText,
      platform_texts: platformTexts,
      scheduled_times: scheduledTimes,
      selected_platforms: selectedPlatforms,
    };
    await fetch('/api/schedule/create', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    alert('Schedule created');
  };

  if (!session) return <div className="p-6">Loading session...</div>;

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Create New Schedule</h1>
      <div className="bg-white shadow rounded p-4 space-y-4">
        <div>
          <label className="block text-sm font-medium">Select content</label>
          <select
            className="border px-3 py-2 rounded w-full"
            value={selectedContent}
            onChange={(e) => setSelectedContent(e.target.value)}
          >
            <option value="">Choose content</option>
            {contents.map((c) => (
              <option key={c.id} value={c.id}>
                {c.type} - {c.text || c.url}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-medium">Unified text</label>
          <textarea
            className="border rounded w-full px-3 py-2"
            rows={6}
            value={unifiedText}
            maxLength={5000}
            onChange={(e) => setUnifiedText(e.target.value)}
          />
          <button className="mt-2 bg-indigo-600 text-white px-3 py-2 rounded" onClick={generateFormats}>
            Generate formats
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {platforms.map((p) => (
            <div key={p.id} className="border rounded p-3 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <label className="font-semibold flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedPlatforms.includes(p.id)}
                      onChange={() => togglePlatform(p.id)}
                    />
                    {p.label}
                  </label>
                  <p className="text-xs text-slate-500">Suggested: {suggestions[p.id]}</p>
                </div>
                <button
                  className="text-xs underline"
                  onClick={() => setScheduledTimes((prev) => ({ ...prev, [p.id]: suggestions[p.id] }))}
                >
                  Use suggestion
                </button>
              </div>
              {p.id === 'youtube_draft' ? (
                <div className="space-y-2">
                  <input
                    className="border rounded px-2 py-1 w-full"
                    placeholder="Title"
                    value={platformTexts.youtube_draft.title}
                    onChange={(e) => setPlatformTexts((prev) => ({ ...prev, youtube_draft: { ...prev.youtube_draft, title: e.target.value } }))}
                  />
                  <textarea
                    className="border rounded px-2 py-1 w-full"
                    rows={3}
                    placeholder="Description"
                    value={platformTexts.youtube_draft.description}
                    onChange={(e) =>
                      setPlatformTexts((prev) => ({ ...prev, youtube_draft: { ...prev.youtube_draft, description: e.target.value } }))
                    }
                  />
                </div>
              ) : (
                <textarea
                  className="border rounded px-2 py-1 w-full"
                  rows={3}
                  value={platformTexts[p.id] as string}
                  onChange={(e) => setPlatformTexts((prev) => ({ ...prev, [p.id]: e.target.value }))}
                />
              )}
              <input
                type="datetime-local"
                className="border rounded px-2 py-1 w-full"
                value={scheduledTimes[p.id] || ''}
                onChange={(e) => setScheduledTimes((prev) => ({ ...prev, [p.id]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        <button className="bg-emerald-600 text-white px-4 py-2 rounded" onClick={submit}>
          Confirm Schedule
        </button>
      </div>
    </div>
  );
}
