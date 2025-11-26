import { Router } from 'express';
import { supabaseService } from '../utils/supabaseClient.js';
import { createSignedContentLinks } from '../utils/storage.js';
import { ScheduleRecord } from '../types.js';

const router = Router();

router.get('/:id', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { data: scheduleRow, error: scheduleError } = await supabaseService
    .from('schedules')
    .select('*')
    .eq('id', req.params.id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (scheduleError || !scheduleRow) {
    return res.status(404).json({ error: 'Schedule not found' });
  }

  const schedule = scheduleRow as ScheduleRecord;
  const { data: content, error: contentErr } = await supabaseService
    .from('contents')
    .select('*')
    .eq('id', schedule.content_id)
    .eq('user_id', user.id)
    .maybeSingle();

  if (contentErr) {
    return res.status(500).json({ error: 'Unable to load content' });
  }

  const signedLinks = await createSignedContentLinks(schedule.content_id);

  return res.json({
    schedule,
    content,
    fallback: {
      sent: schedule.fallback_sent,
      sent_at: schedule.fallback_sent_at,
      last_error: schedule.last_error,
    },
    signed_links: signedLinks,
  });
});

export default router;
