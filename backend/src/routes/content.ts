import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';

const router = Router();
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'content';

router.post('/signed-url', async (req, res) => {
  const user = (req as any).user;
  const { type, mimeType } = req.body as { type: 'image' | 'video' | 'text'; mimeType: string };

  if (!['image', 'video', 'text'].includes(type)) {
    return res.status(400).json({ error: 'Unsupported type' });
  }

  if (mimeType && /(application|text)\/x-(sh|msdownload)/.test(mimeType)) {
    return res.status(400).json({ error: 'Executable uploads blocked' });
  }

  const objectPath = `content/${user.id}/${uuid()}`;
  const { data, error } = await supabaseService.storage.from(BUCKET).createSignedUploadUrl(objectPath);
  if (error || !data) {
    return res.status(500).json({ error: 'Unable to create upload URL' });
  }

  res.json({ uploadUrl: data.signedUrl, path: objectPath });
});

router.post('/complete', async (req, res) => {
  const user = (req as any).user;
  const { path, type, text } = req.body as { path: string; type: 'image' | 'video' | 'text'; text?: string };

  if (!path?.startsWith(`content/${user.id}`)) {
    return res.status(403).json({ error: 'Invalid path' });
  }

  const { error } = await supabaseService.from('contents').insert({
    id: uuid(),
    user_id: user.id,
    type,
    url: path,
    text: text || null,
  });

  if (error) {
    return res.status(500).json({ error: 'Unable to save content' });
  }

  res.json({ status: 'ok' });
});

router.get('/list', async (req, res) => {
  const user = (req as any).user;
  const { data, error } = await supabaseService.from('contents').select('*').eq('user_id', user.id).order('created_at', { ascending: false });
  if (error) {
    return res.status(500).json({ error: 'Unable to list content' });
  }

  const signed = await Promise.all(
    (data || []).map(async (item) => {
      if (item.url) {
        const { data: signedUrl } = await supabaseService.storage
          .from(BUCKET)
          .createSignedUrl(item.url, 60 * 60 * 24);
        return { ...item, signedUrl: signedUrl?.signedUrl };
      }
      return item;
    })
  );

  res.json(signed);
});

export default router;
