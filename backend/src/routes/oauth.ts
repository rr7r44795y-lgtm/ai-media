import { Router } from 'express';
import { v4 as uuid } from 'uuid';
import { exchangeCode, buildAuthorizeUrl, Platform } from '../services/oauth.js';
import { refreshIfExpired } from '../utils/refreshToken.js';
import { supabaseService } from '../utils/supabaseClient.js';
import { createOAuthState, consumeOAuthState } from '../services/oauthStates.js';
import { encryptToken } from '../utils/encryption.js';
import authMiddleware from '../middleware/authMiddleware.js';
import { SocialPlatform } from '../types.js';

const router = Router();

const SUPPORTED_PLATFORMS: SocialPlatform[] = ['instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'];

router.get('/:platform/start', authMiddleware, async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const platform = req.params.platform as Platform;

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'invalid_platform' });
  }

  const appBase = process.env.APP_BASE_URL || '/';
  const redirectAfter = (req.query.redirect as string | undefined) || `${appBase}/oauth/complete`;

  try {
    const stateRow = await createOAuthState(user.id, redirectAfter);
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

  if (!SUPPORTED_PLATFORMS.includes(platform)) {
    return res.status(400).json({ error: 'invalid_platform' });
  }

  const fallbackRedirect = `${appBase}/oauth/complete`;
  let redirectAfter = fallbackRedirect;
  let userId: string | null = null;

  try {
    if (!state) {
      throw new Error('invalid_state');
    }
    const stateRow = await consumeOAuthState(state);
    userId = stateRow.user_id;
    redirectAfter = stateRow.redirect_after || fallbackRedirect;
  } catch (err) {
    const errorRedirect = new URL(redirectAfter, redirectAfter.startsWith('http') ? undefined : appBase);
    errorRedirect.searchParams.set('connected', 'failed');
    errorRedirect.searchParams.set('error', 'oauth_error');
    return res.redirect(errorRedirect.toString());
  }

  const redirectUrl = new URL(redirectAfter, redirectAfter.startsWith('http') ? undefined : appBase);

  if (!code || !userId) {
    redirectUrl.searchParams.set('connected', 'failed');
    redirectUrl.searchParams.set('error', 'oauth_error');
    return res.redirect(redirectUrl.toString());
  }

  try {
    const tokens = await exchangeCode(platform, code);

    for (const token of tokens) {
      const record = {
        id: uuid(),
        user_id: userId,
        platform: token.platform,
        external_account_id: token.external_account_id,
        access_token_encrypted: encryptToken(token.access_token),
        refresh_token_encrypted: token.refresh_token ? encryptToken(token.refresh_token) : null,
        expires_at: token.expires_at ? token.expires_at.toISOString() : null,
        disabled: false,
      };

      const { error } = await supabaseService
        .from('social_accounts')
        .upsert(record, { onConflict: 'user_id,platform,external_account_id' });

      if (error) {
        throw error;
      }
    }

    redirectUrl.searchParams.set('connected', 'success');
    redirectUrl.searchParams.set('platform', platform);
    return res.redirect(redirectUrl.toString());
  } catch (e) {
    redirectUrl.searchParams.set('connected', 'failed');
    redirectUrl.searchParams.set('error', 'oauth_error');
    return res.redirect(redirectUrl.toString());
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
