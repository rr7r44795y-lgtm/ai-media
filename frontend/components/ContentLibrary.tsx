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
  const [tags, setTags] = useState<any[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

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
    setLoading(true);
    const token = session?.access_token;
    const res = await fetch('/api/content/list', { headers: { Authorization: `Bearer ${token}` } });
    const data = await res.json();
    setItems(data);
    const tagRes = await fetch('/api/tags', { headers: { Authorization: `Bearer ${token}` } });
    setTags(await tagRes.json());
    setLoading(false);
  };

  const assignTag = async (contentId: string, name: string) => {
    const token = session?.access_token;
    await fetch('/api/tags/assign', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ content_id: contentId, name }),
    });
    load();
  };

  const toggleFilter = (id: string) => {
    setSelectedTags((prev) => (prev.includes(id) ? prev.filter((t) => t !== id) : [...prev, id]));
  };

  const filteredItems = selectedTags.length
    ? items.filter((item) => item.tags?.some((t: any) => selectedTags.includes(t.id)))
    : items;

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
      <div className="grid grid-cols-4 gap-4 mt-4">
        <div className="col-span-1 border rounded p-3 h-full">
          <div className="flex items-center justify-between mb-2">
            <h3 className="font-semibold">Tags</h3>
            <button className="text-xs underline" onClick={load}>
              Refresh
            </button>
          </div>
          <p className="text-xs text-slate-500 mb-2">Filter by multiple tags.</p>
          <div className="space-y-1 overflow-y-auto max-h-72">
            {tags.map((tag) => (
              <label key={tag.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={selectedTags.includes(tag.id)} onChange={() => toggleFilter(tag.id)} />
                <span>{tag.name}</span>
              </label>
            ))}
            {tags.length === 0 && <p className="text-xs text-slate-500">No tags yet</p>}
          </div>
        </div>
        <div className="col-span-3 grid grid-cols-2 gap-3">
          {filteredItems.map((item) => (
            <div key={item.id} className="border rounded p-3 space-y-2">
              <div className="text-sm font-semibold flex justify-between items-center">
                <span>{item.type}</span>
                <button
                  className="text-xs underline"
                  onClick={() => {
                    const name = prompt('Add tag');
                    if (name) assignTag(item.id, name);
                  }}
                >
                  Add tag
                </button>
              </div>
              {item.type === 'text' ? (
                <p className="text-slate-700 text-sm whitespace-pre-wrap">{item.text}</p>
              ) : (
                <a className="text-indigo-600 underline" href={item.signedUrl} target="_blank" rel="noreferrer">
                  View file
                </a>
              )}
              <div className="flex flex-wrap gap-2">
                {(item.tags || []).map((tag: any) => (
                  <span key={tag.id} className="px-2 py-1 bg-slate-100 text-xs rounded">
                    {tag.name}
                  </span>
                ))}
              </div>
            </div>
          ))}
          {loading && <div className="text-sm">Loading...</div>}
        </div>
      </div>
    </div>
  );
}
