import { Router } from 'express';
import { queueGdprDelete, processPendingDeletes } from '../services/gdpr.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = Router();

router.post('/requestDelete', authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });

  await queueGdprDelete(user.id);
  res.json({ status: 'queued' });
});

router.post('/process', async (req, res) => {
  const secretHeader = req.headers['x-gdpr-secret'] as string | undefined;
  const secretBody = (req.body as { secret?: string } | undefined)?.secret;
  const secret = secretHeader || secretBody;
  if (!secret || secret !== process.env.GDPR_CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const processed = await processPendingDeletes();
  res.json({ status: 'ok', processed });
});

export default router;
