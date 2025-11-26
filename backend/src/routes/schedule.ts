import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { supabaseService } from '../utils/supabaseClient.js';
type SchedulePlatform = 'ig' | 'facebook' | 'linkedin' | 'youtube_draft';

const router = Router();

const limits: Record<string, number> = {
  ig: 2200,
  facebook: 20000,
  linkedin: 3000,
};

router.post('/create', async (req, res) => {
  const user = (req as any).user;
  const { content_id, unified_text, platform_texts, scheduled_times, selected_platforms } = req.body as {
    content_id: string;
    unified_text: string;
    platform_texts: Record<string, unknown>;
    scheduled_times: Record<string, string>;
    selected_platforms: SchedulePlatform[];
  };

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
    }
  }

  const inserts = selected_platforms.map((platform) => {
    const text = platform_texts[platform as string];
    return {
      id: uuid(),
      user_id: user.id,
      platform,
      content_id,
      platform_text: text,
      scheduled_time: scheduled_times[platform as string],
      status: 'pending',
      tries: 0,
    };
  });

  const { error } = await supabaseService.from('schedules').insert(inserts);
  if (error) return res.status(500).json({ error: 'Unable to create schedule' });

  res.json({ status: 'ok' });
});

export default router;
