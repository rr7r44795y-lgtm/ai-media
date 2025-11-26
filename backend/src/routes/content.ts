import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';

const router = Router();
const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || 'content';

router.post('/signed-url', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
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
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
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
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseService
    .from('contents')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) {
    return res.status(500).json({ error: 'Unable to list content' });
  }

  const signed = await Promise.all(
    (data || []).map(async (item) => {
      let signedUrl: string | undefined;
      if (item.url) {
        const urlRes = await supabaseService.storage.from(BUCKET).createSignedUrl(item.url, 60 * 60 * 24);
        signedUrl = urlRes.data?.signedUrl;
      }
      const { data: tagRows } = await supabaseService
        .from('content_tags')
        .select('tag_id,tags(name)')
        .eq('content_id', item.id)
        .eq('user_id', user.id)
        .is('deleted_at', null);
      const tags = (tagRows || []).map((row) => ({
        id: row.tag_id,
        name: (row.tags as { name?: string } | null)?.name || '',
      }));
      return { ...item, signedUrl, tags };
    })
  );

  res.json(signed);
});

export default router;
