import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { buildAuthorizeUrl, saveTokens, Platform, exchangeCode } from '../services/oauth.js';
import { refreshIfExpired } from '../utils/refreshToken.js';

const router = Router();
const stateStore = new Map<string, string>();

router.get('/:platform/start', (req, res) => {
  const user = (req as any).user;
  const platform = req.params.platform as Platform;
  const state = uuid();
  stateStore.set(state, user.id);
  const url = buildAuthorizeUrl(platform, state);
  res.json({ url, state });
});

router.post('/:platform/callback', async (req, res) => {
  const user = (req as any).user;
  const platform = req.params.platform as Platform;
  const { code, state } = req.body as { code: string; state: string };
  const stored = stateStore.get(state);
  if (!stored || stored !== user.id) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  try {
    const tokens = await exchangeCode(platform, code);
    await saveTokens({
      userId: user.id,
      platform,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalId: tokens.externalId,
      expiresAt: tokens.expiresAt,
    });
    res.json({ status: 'connected' });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/:platform/refresh', async (req, res) => {
  const user = (req as any).user;
  const platform = req.params.platform as Platform;
  const refreshed = await refreshIfExpired(platform, user.id);
  if (refreshed.error) {
    return res.status(400).json({ error: refreshed.error });
  }
  res.json({ accessToken: refreshed.accessToken });
});

export default router;
