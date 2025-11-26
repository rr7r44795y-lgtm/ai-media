import { Router } from 'express';
import { supabaseService } from '../utils/supabaseClient.js';

const router = Router();

router.get('/', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseService
    .from('social_accounts')
    .select('id, platform, external_account_id, expires_at, created_at, disabled')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load accounts' });
  return res.json(data || []);
});

router.delete('/:id', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { error } = await supabaseService
    .from('social_accounts')
    .update({ disabled: true, access_token_encrypted: '', refresh_token_encrypted: null, expires_at: null })
    .eq('id', req.params.id)
    .eq('user_id', user.id);
  if (error) return res.status(500).json({ error: 'Unable to disconnect' });
  return res.json({ status: 'disconnected' });
});

export default router;
