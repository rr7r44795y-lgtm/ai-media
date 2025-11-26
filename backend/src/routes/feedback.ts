import { Router } from 'express';
import { supabaseService } from '../utils/supabaseClient.js';
import { FeedbackPayload } from '../types.js';

const router = Router();

router.post('/create', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const payload = req.body as FeedbackPayload;
  if (!payload.message || !payload.type) return res.status(400).json({ error: 'Invalid feedback' });
  const { error } = await supabaseService.from('feedback').insert({
    user_id: user.id,
    type: payload.type,
    message: payload.message,
    metadata: payload.metadata || {},
  });
  if (error) return res.status(500).json({ error: 'Unable to submit' });
  res.json({ status: 'ok' });
});

export default router;
