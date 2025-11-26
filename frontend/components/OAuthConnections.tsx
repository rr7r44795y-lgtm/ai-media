'use client';

import { useState } from 'react';
import { v4 as uuid } from 'uuid';

const platforms: { id: string; label: string }[] = [
  { id: 'instagram_business', label: 'Instagram Business' },
  { id: 'facebook_page', label: 'Facebook Page' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'youtube_draft', label: 'YouTube Draft' },
];

export default function OAuthConnections({ session }: { session: any }) {
  const [status, setStatus] = useState<Record<string, string>>({});

  const connect = async (platform: string) => {
    const token = session?.access_token;
    const res = await fetch(`/api/oauth/${platform}/start`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    window.open(data.url, '_blank');
  };

  const mockCallback = async (platform: string) => {
    const state = uuid();
    await fetch(`/api/oauth/${platform}/callback`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code: 'demo-code', state }),
    });
    setStatus((prev) => ({ ...prev, [platform]: 'connected' }));
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <h2 className="text-xl font-semibold mb-2">OAuth Connections</h2>
      <p className="text-sm text-slate-500 mb-3">Tokens are encrypted with AES-256 and refreshed automatically.</p>
      <div className="grid grid-cols-2 gap-3">
        {platforms.map((platform) => (
          <div key={platform.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <div className="font-semibold">{platform.label}</div>
              <div className="text-xs text-slate-500">{status[platform.id] || 'Not connected'}</div>
            </div>
            <div className="space-x-2">
              <button className="bg-indigo-600 text-white px-3 py-1 rounded" onClick={() => connect(platform.id)}>
                Connect
              </button>
              <button className="text-sm underline" onClick={() => mockCallback(platform.id)}>
                Complete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
