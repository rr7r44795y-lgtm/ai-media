import { Router } from 'express';
import { validate as validateUuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';
import { markFailure, markProcessing, markSuccess } from '../services/scheduleService.js';
import { publishToPlatform } from '../services/platformPublisher.js';
import { ScheduleRecord, SocialPlatform, WorkerRequest } from '../types.js';
import { createSignedContentLinks } from '../utils/storage.js';

const router = Router();

const allowedPlatforms: SocialPlatform[] = ['instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'];

router.post('/publish', async (req, res) => {
  const secret = req.header('x-worker-secret');
  if (!secret || secret !== process.env.WORKER_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const { id } = req.query as WorkerRequest;
  if (!id || !validateUuid(id)) {
    return res.status(400).json({ error: 'invalid id' });
  }

  const { data: scheduleData, error } = await supabaseService
    .from('schedules')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (error || !scheduleData) {
    return res.status(404).json({ error: 'not_found' });
  }

  const schedule = scheduleData as ScheduleRecord & { social_account_id?: string };
  if (schedule.status === 'cancelled') return res.status(409).json({ error: 'cancelled' });
  if (schedule.status === 'success') return res.status(409).json({ error: 'already_published' });
  if (!allowedPlatforms.includes(schedule.platform as SocialPlatform)) {
    return res.status(400).json({ error: 'invalid_platform' });
  }

  const socialAccountId = schedule.social_account_id;
  if (!socialAccountId) {
    return res.status(404).json({ error: 'not_found' });
  }

  const { data: socialAccount, error: socialError } = await supabaseService
    .from('social_accounts')
    .select('id, user_id')
    .eq('id', socialAccountId)
    .maybeSingle();

  if (socialError || !socialAccount) {
    return res.status(404).json({ error: 'not_found' });
  }

  if (socialAccount.user_id !== schedule.user_id) {
    return res.status(403).json({ error: 'forbidden' });
  }

  const processing = await markProcessing(id);
  if (!processing) return res.status(409).json({ error: 'conflict' });

  try {
    const result = await publishToPlatform(processing);
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
