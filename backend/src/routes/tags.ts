import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';
import { isSafeTagName } from '../utils/text.js';

const router = Router();

router.get('/', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseService
    .from('tags')
    .select('id,name,created_at,deleted_at,usage_count')
    .eq('user_id', user.id)
    .is('deleted_at', null)
    .order('usage_count', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to list tags' });
  res.json(data || []);
});

router.post('/assign', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { content_id, name } = req.body as { content_id: string; name: string };
  if (!name || name.length > 30 || !isSafeTagName(name)) {
    return res.status(400).json({ error: 'Invalid tag name' });
  }

  const { data: content, error: contentErr } = await supabaseService
    .from('contents')
    .select('id')
    .eq('id', content_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (contentErr || !content) return res.status(403).json({ error: 'Content not found' });

  const { data: existing } = await supabaseService
    .from('tags')
    .select('id')
    .eq('user_id', user.id)
    .eq('name', name)
    .is('deleted_at', null)
    .maybeSingle();
  let tagId = existing?.id;
  if (!tagId) {
    tagId = uuid();
    const { error: insertErr } = await supabaseService.from('tags').insert({
      id: tagId,
      user_id: user.id,
      name,
    });
    if (insertErr) return res.status(500).json({ error: 'Unable to create tag' });
  }

  const { error: mapErr } = await supabaseService.from('content_tags').upsert({
    id: uuid(),
    content_id,
    tag_id: tagId,
    user_id: user.id,
  });
  if (mapErr) return res.status(500).json({ error: 'Unable to assign tag' });

  res.json({ tag_id: tagId });
});

router.post('/remove', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { tag_id } = req.body as { tag_id: string };
  const { error } = await supabaseService
    .from('tags')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', tag_id)
    .eq('user_id', user.id);
  if (error) return res.status(500).json({ error: 'Unable to delete tag' });
  res.json({ status: 'deleted' });
});

router.get('/by-content/:contentId', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { contentId } = req.params;
  const { data, error } = await supabaseService
    .from('content_tags')
    .select('tag_id,tags(name)')
    .eq('user_id', user.id)
    .eq('content_id', contentId)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: 'Unable to load tags' });
  res.json(
    data?.map((d) => ({
      id: d.tag_id,
      name: (d.tags as { name?: string } | null)?.name || '',
    })) || []
  );
});

export default router;
