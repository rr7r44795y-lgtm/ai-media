import { Router } from 'express';
import { exchangeCode, buildAuthorizeUrl, saveTokens, Platform } from '../services/oauth.js';
import { refreshIfExpired } from '../utils/refreshToken.js';
import { supabaseService } from '../utils/supabaseClient.js';
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
    res.redirect(url);
  } catch (e) {
    res.status(400).json({ error: (e as Error).message });
  }
});

router.get('/:platform/callback', async (req, res) => {
  const platform = req.params.platform as Platform;
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;
  const appBase = process.env.APP_BASE_URL || '/';

  const stateRow = state ? await consumeOAuthState(state) : null;
  const redirectAfter = stateRow?.redirect_after || `${appBase}/integrations`;
  const redirectUrl = new URL(redirectAfter, redirectAfter.startsWith('http') ? undefined : appBase);

  if (!stateRow || !state || !code) {
    redirectUrl.searchParams.set('oauth', 'error');
    redirectUrl.searchParams.set('reason', 'invalid_state');
    return res.redirect(redirectUrl.toString());
  }

  try {
    const tokens = await exchangeCode(platform, code);
    await saveTokens(stateRow.user_id, tokens);
    redirectUrl.searchParams.set('oauth', 'success');
    res.redirect(redirectUrl.toString());
  } catch (e) {
    redirectUrl.searchParams.set('oauth', 'error');
    redirectUrl.searchParams.set('reason', (e as Error).message);
    res.redirect(redirectUrl.toString());
  }
});

router.post('/:platform/refresh', authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const platform = req.params.platform as Platform;
  const socialAccountId = (req.body?.social_account_id || req.query?.social_account_id) as string | undefined;

  if (!socialAccountId) {
    return res.status(400).json({ error: 'social_account_id_required' });
  }

  const { data: account, error } = await supabaseService
    .from('social_accounts')
    .select('id, user_id, platform')
    .eq('id', socialAccountId)
    .single();

  if (error || !account) {
    return res.status(404).json({ error: 'OAuth not found' });
  }

  if (account.user_id !== user.id) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  if (account.platform !== platform) {
    return res.status(400).json({ error: 'platform_mismatch' });
  }

  const refreshed = await refreshIfExpired(socialAccountId);
  if (refreshed.error) {
    return res.status(400).json({ error: refreshed.error });
  }
  res.json({ accessToken: refreshed.accessToken });
});

export default router;
