'use client';

import { useState } from 'react';
import { v4 as uuid } from 'uuid';
import { getClient } from '../lib/supabaseClient';

const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 100 * 1024 * 1024;

async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0);
  return new Promise((resolve) => canvas.toBlob((blob) => resolve(blob || file), 'image/webp', 0.8));
}

export default function ContentLibrary({ session }: { session: any }) {
  const supabase = getClient();
  const [files, setFiles] = useState<FileList | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [textContent, setTextContent] = useState('');

  const upload = async () => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const isImage = file.type.startsWith('image/');
    const isVideo = file.type === 'video/mp4';
    if (isImage && file.size > MAX_IMAGE) throw new Error('Image too large');
    if (isVideo && file.size > MAX_VIDEO) throw new Error('Video too large');

    const type: 'image' | 'video' | 'text' = isImage ? 'image' : isVideo ? 'video' : 'text';
    if (type === 'text') throw new Error('Use text field');

    const body = { type, mimeType: file.type };
    const token = session?.access_token;
    const response = await fetch('/api/content/signed-url', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    const path = data.path as string;
    const uploadUrl = data.uploadUrl as string;

    let uploadFile: Blob | File = file;
    if (isImage) uploadFile = (await compressImage(file)) as Blob;

    await fetch(uploadUrl, { method: 'PUT', body: uploadFile });
    await fetch('/api/content/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type }),
    });
    setFiles(null);
    load();
  };

  const uploadText = async () => {
    if (!textContent.trim()) return;
    const token = session?.access_token;
    const path = `content/${session.user.id}/${uuid()}`;
    await fetch('/api/content/complete', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ path, type: 'text', text: textContent }),
    });
    setTextContent('');
    load();
  };

  const load = async () => {
    const token = session?.access_token;
    const res = await fetch('/api/content/list', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setItems(data);
  };

  return (
    <div className="bg-white p-4 rounded shadow">
      <div className="flex items-center justify-between mb-3">
        <div>
          <h2 className="text-xl font-semibold">Content Library</h2>
          <p className="text-sm text-slate-500">Private uploads with signed URLs only.</p>
        </div>
        <button className="text-sm underline" onClick={load}>
          Refresh
        </button>
      </div>
      <div className="space-y-3">
        <div className="flex gap-2 items-center">
          <input type="file" onChange={(e) => setFiles(e.target.files)} accept="image/png,image/jpeg,image/webp,video/mp4" />
          <button className="bg-indigo-600 text-white px-3 py-2 rounded" onClick={upload}>
            Upload Content
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <input
            value={textContent}
            onChange={(e) => setTextContent(e.target.value)}
            className="border px-3 py-2 rounded flex-1"
            placeholder="Save a text snippet"
          />
          <button className="bg-slate-800 text-white px-3 py-2 rounded" onClick={uploadText}>
            Save Text
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3 mt-4">
        {items.map((item) => (
          <div key={item.id} className="border rounded p-3">
            <div className="text-sm font-semibold">{item.type}</div>
            {item.type === 'text' ? (
              <p className="text-slate-700 text-sm whitespace-pre-wrap">{item.text}</p>
            ) : (
              <a className="text-indigo-600 underline" href={item.signedUrl} target="_blank" rel="noreferrer">
                View file
              </a>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
