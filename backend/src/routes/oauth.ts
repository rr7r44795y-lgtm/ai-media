import { Router } from 'express';
import { exchangeCode, buildAuthorizeUrl, saveTokens, Platform } from '../services/oauth.js';
import { refreshIfExpired } from '../utils/refreshToken.js';
import { createOAuthState, consumeOAuthState } from '../services/oauthStates.js';
import authMiddleware from '../middleware/authMiddleware.js';

const router = Router();

router.get('/:platform/start', authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const platform = req.params.platform as Platform;
  try {
    const stateRow = await createOAuthState(user.id, req.query.redirect as string | undefined);
    const url = buildAuthorizeUrl(platform, stateRow.state);
    res
      .cookie('oauth_user', user.id, {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 5 * 60 * 1000,
      })
      .json({ url, state: stateRow.state });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/:platform/callback', async (req, res) => {
  const platform = req.params.platform as Platform;
  const { code, state } = req.body as { code: string; state: string };
  const stateRow = await consumeOAuthState(state);
  const userId = (req.cookies?.oauth_user as string | undefined) || stateRow?.user_id;
  if (!stateRow || !userId) {
    return res.status(400).json({ error: 'Invalid state' });
  }

  try {
    const tokens = await exchangeCode(platform, code);
    await saveTokens({
      userId,
      platform,
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      externalId: tokens.externalId,
      expiresAt: tokens.expiresAt,
    });
    res.clearCookie('oauth_user').json({ status: 'connected', redirect_after: stateRow.redirect_after });
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.post('/:platform/refresh', authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const platform = req.params.platform as Platform;
  const refreshed = await refreshIfExpired(platform, user.id);
  if (refreshed.error) {
    return res.status(400).json({ error: refreshed.error });
  }
  res.json({ accessToken: refreshed.accessToken });
});

export default router;
