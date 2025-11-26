import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';
import { matchesForbiddenWord } from '../utils/blocklist.js';
import { cancelSchedule } from '../services/scheduleService.js';
import { ScheduleCalendarItem, ScheduleRecord, ScheduleStatus, SocialPlatform } from '../types.js';
import { extractTextPreview } from '../utils/string.js';

const router = Router();

const limits: Record<string, number> = {
  instagram_business: 2200,
  facebook_page: 20000,
  linkedin: 3000,
};

router.post('/create', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { content_id, unified_text, platform_texts, scheduled_times, selected_platforms } = req.body as {
    content_id: string;
    unified_text: string;
    platform_texts: Record<string, unknown>;
    scheduled_times: Record<string, string>;
    selected_platforms: SocialPlatform[];
  };

  if (matchesForbiddenWord(unified_text)) {
    return res.status(400).json({ error: 'Content contains forbidden language' });
  }

  const { data: content, error: contentErr } = await supabaseService
    .from('contents')
    .select('id')
    .eq('id', content_id)
    .eq('user_id', user.id)
    .maybeSingle();
  if (contentErr || !content) return res.status(403).json({ error: 'Content not found' });

  const now = Date.now();
  const seenTimes = new Set<number>();

  for (const platform of selected_platforms) {
    const text = platform_texts[platform as string];
    const timeStr = scheduled_times[platform as string];
    if (!timeStr) return res.status(400).json({ error: `Scheduled time required for ${platform}` });
    const scheduledAt = Date.parse(timeStr);
    if (Number.isNaN(scheduledAt) || scheduledAt < now + 60 * 1000) {
      return res.status(400).json({ error: `Invalid scheduled time for ${platform}` });
    }
    if (seenTimes.has(scheduledAt)) {
      return res.status(400).json({ error: 'Times must differ per platform' });
    }
    seenTimes.add(scheduledAt);

    if (platform === 'youtube_draft') {
      const yt = text as { title?: string; description?: string };
      if (!yt?.title || !yt?.description) return res.status(422).json({ error: 'YouTube title/description required' });
      if (yt.title.length > 100 || yt.description.length > 5000) return res.status(400).json({ error: 'YouTube length exceeded' });
    } else {
      const str = typeof text === 'string' ? text : '';
      if (!str.trim()) return res.status(422).json({ error: `Text required for ${platform}` });
      const max = limits[platform as string] || 20000;
      if (str.length > max) return res.status(400).json({ error: `${platform} text too long` });
      if (matchesForbiddenWord(str)) return res.status(400).json({ error: 'Forbidden content detected' });
    }
  }

  const inserts = selected_platforms.map((platform) => {
    const text = platform_texts[platform as string];
    const timeStr = scheduled_times[platform as string];
    const scheduledAtIso = new Date(timeStr).toISOString();
    return {
      id: uuid(),
      user_id: user.id,
      platform,
      content_id,
      platform_text: text,
      scheduled_time: scheduledAtIso,
      status: 'pending' as ScheduleStatus,
      tries: 0,
      next_retry_at: scheduledAtIso,
    };
  });

  const { error } = await supabaseService.from('schedules').insert(inserts);
  if (error) return res.status(500).json({ error: 'Unable to create schedule' });

  res.json({ status: 'ok' });
});

router.get('/list', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data, error } = await supabaseService
    .from('schedules')
    .select('*')
    .eq('user_id', user.id)
    .order('scheduled_time', { ascending: false });
  if (error) return res.status(500).json({ error: 'Unable to load schedules' });
  return res.json(data as ScheduleRecord[]);
});

const isoDateRegex = /^\d{4}-\d{2}-\d{2}$/;

const parseDateOnly = (dateStr: string): Date | null => {
  if (!isoDateRegex.test(dateStr)) return null;
  const parsed = Date.parse(`${dateStr}T00:00:00.000Z`);
  if (Number.isNaN(parsed)) return null;
  return new Date(parsed);
};

router.get('/calendar', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  const { start, end } = req.query as { start?: string; end?: string };
  if (!start || !end) {
    return res.status(400).json({ error: 'Missing date range' });
  }

  const startDate = parseDateOnly(start);
  const endDate = parseDateOnly(end);
  if (!startDate || !endDate) {
    return res.status(400).json({ error: 'Invalid date format' });
  }

  if (endDate.getTime() < startDate.getTime()) {
    return res.status(400).json({ error: 'Invalid date range' });
  }

  const diffDays = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60 * 24);
  if (diffDays > 60) {
    return res.status(422).json({ error: 'Date range too large' });
  }

  const startIso = new Date(Date.UTC(startDate.getUTCFullYear(), startDate.getUTCMonth(), startDate.getUTCDate(), 0, 0, 0)).toISOString();
  const endIso = new Date(Date.UTC(endDate.getUTCFullYear(), endDate.getUTCMonth(), endDate.getUTCDate(), 23, 59, 59, 999)).toISOString();

  const { data, error } = await supabaseService
    .from('schedules')
    .select('*')
    .eq('user_id', user.id)
    .gte('scheduled_time', startIso)
    .lte('scheduled_time', endIso)
    .order('scheduled_time', { ascending: true });

  if (error) {
    return res.status(500).json({ error: 'Unable to load calendar' });
  }

  const items: ScheduleCalendarItem[] = (data as ScheduleRecord[]).map((row) => ({
    id: row.id,
    platform: row.platform,
    scheduled_time: row.scheduled_time,
    status: row.status,
    platform_text_preview: extractTextPreview(row.platform_text, 20),
    content_id: row.content_id,
    tries: row.tries,
  }));

  return res.json(items);
});

router.post('/:id/cancel', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const ok = await cancelSchedule(req.params.id, user.id);
  if (!ok) return res.status(500).json({ error: 'Unable to cancel' });
  res.json({ status: 'cancelled' });
});

export default router;
