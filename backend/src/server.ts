import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { z } from 'zod';

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

app.get('/api/health', (_req: Request, res: Response) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

const schedulePayloadSchema = z.object({
  content_id: z.string().uuid(),
  unified_text: z.string().min(1),
  platform_texts: z.object({
    ig: z.string().min(1),
    facebook: z.string().min(1),
    linkedin: z.string().min(1),
    youtube_draft: z.object({ title: z.string().min(1), description: z.string().min(1) }),
  }),
  scheduled_times: z.object({
    ig: z.string(),
    facebook: z.string(),
    linkedin: z.string(),
    youtube_draft: z.string(),
  }),
  selected_platforms: z.array(
    z.enum(['instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'])
  ),
});

app.post('/api/schedule/create', (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = schedulePayloadSchema.parse(req.body);
    // In a full implementation, this would validate auth, ownership, and persist to the database.
    res.status(202).json({
      message: 'Schedule accepted for processing',
      payload: parsed,
    });
  } catch (error) {
    next(error);
  }
});

app.get('/api/best-time', (req: Request, res: Response) => {
  const platform = req.query.platform as string;
  const recommendations: Record<string, { recommended: string; reason: string; alternatives: string[] }> = {
    ig: {
      recommended: '19:00',
      reason: 'IG 在晚间 19-22 时互动率最高',
      alternatives: ['20:00', '21:00'],
    },
    facebook: {
      recommended: '12:00',
      reason: 'Facebook 午餐与晚间时段互动更活跃',
      alternatives: ['14:00', '19:30'],
    },
    linkedin: {
      recommended: '08:30',
      reason: 'LinkedIn 在工作日早间与收工前互动较高',
      alternatives: ['10:00', '17:00'],
    },
    youtube: {
      recommended: '15:00',
      reason: '上传草稿后可在晚间进行优化与发布',
      alternatives: ['16:00', '18:30'],
    },
  };

  if (!platform || !recommendations[platform]) {
    return res.status(400).json({ error: 'platform query param required: ig/facebook/linkedin/youtube' });
  }

  const now = new Date();
  const today = now.toISOString().split('T')[0];
  const rec = recommendations[platform];
  res.json({
    recommended: `${today}T${rec.recommended}:00`,
    reason: rec.reason,
    alternatives: rec.alternatives,
  });
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof z.ZodError) {
    return res.status(422).json({ error: 'Invalid payload', details: err.errors });
  }
  console.error(err);
  return res.status(500).json({ error: 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Backend server listening on port ${PORT}`);
});
