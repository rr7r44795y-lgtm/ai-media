import { Router } from 'express';
import { supabaseService } from '../utils/supabaseClient.js';
import { markFailure, markProcessing, markSuccess } from '../services/scheduleService.js';
import { publishToPlatform } from '../services/platformPublisher.js';
import { ScheduleRecord } from '../types.js';
import { createSignedContentLinks } from '../utils/storage.js';

const router = Router();

router.post('/publish', async (req, res) => {
  const id = req.query.id as string;
  if (!id) return res.status(400).json({ error: 'id required' });

  const processing = await markProcessing(id);
  if (!processing) return res.status(409).json({ error: 'Already processed' });

  const { data: scheduleData, error } = await supabaseService
    .from('schedules')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !scheduleData) {
    return res.status(404).json({ error: 'Schedule not found' });
  }
  const schedule = scheduleData as ScheduleRecord;
  if (schedule.status === 'cancelled') return res.status(200).json({ status: 'cancelled' });

  try {
    const result = await publishToPlatform(schedule);
    if (result.success && result.url) {
      await markSuccess(schedule.id, result.url);
      return res.json({ status: 'success', url: result.url });
    }
    const errorMessage = result.error || 'Unknown error';
    const fallbackLinks = result.fallback_links || (result.fatal ? await createSignedContentLinks(schedule.content_id) : []);
    const failureResult = await markFailure(schedule, errorMessage, {
      forceFallback: result.fatal,
      signedLinks: fallbackLinks.length ? fallbackLinks : undefined,
    });

    if (failureResult.fallbackTriggered) {
      return res.status(500).json({ error: errorMessage, fallback: { sent: true, links: failureResult.signedLinks } });
    }

    const { data: updatedSchedule } = await supabaseService
      .from('schedules')
      .select('*')
      .eq('id', schedule.id)
      .maybeSingle();

    return res.status(500).json({ error: errorMessage, schedule: updatedSchedule });
  } catch (e) {
    const errMsg = e instanceof Error ? e.message : 'Internal error';
    const failureResult = await markFailure(schedule, errMsg);
    if (failureResult.fallbackTriggered) {
      return res.status(500).json({ error: errMsg, fallback: { sent: true, links: failureResult.signedLinks } });
    }
    return res.status(500).json({ error: errMsg });
  }
});

export default router;
