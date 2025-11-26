import { Router } from 'express';
import { formatMultiple, PlatformKey } from '../services/formatAdapter.js';

const router = Router();

router.post('/generate', (req, res) => {
  const { unified_text, platforms } = req.body as { unified_text: string; platforms: PlatformKey[] };
  if (!unified_text || unified_text.length > 5000) {
    return res.status(400).json({ error: 'Unified text required and must be <= 5000 chars' });
  }
  if (!Array.isArray(platforms) || platforms.length === 0) {
    return res.status(400).json({ error: 'Platforms required' });
  }

  try {
    const formatted = formatMultiple(platforms, unified_text);
    res.json(formatted);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

export default router;
