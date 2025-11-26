import { Router } from 'express';
import Stripe from 'stripe';
import { supabaseService } from '../utils/supabaseClient.js';

const router = Router();
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

const plans = {
  free: { priceId: null, quota: 20 },
  starter: { priceId: process.env.STRIPE_PRICE_MONTHLY, quota: 999 },
  annual: { priceId: process.env.STRIPE_PRICE_ANNUAL, quota: 999 },
  intro: { priceId: process.env.STRIPE_PRICE_INTRO, quota: 30 },
};

router.post('/create-session', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { plan } = req.body as { plan: keyof typeof plans };
  const planConfig = plans[plan];
  if (!planConfig) return res.status(400).json({ error: 'Invalid plan' });

  if (plan === 'intro') {
    const { data: existing } = await supabaseService
      .from('billing')
      .select('plan_type')
      .eq('user_id', user.id)
      .maybeSingle();
    if (existing) {
      const standardPrice = plans.starter.priceId;
      if (!standardPrice) return res.status(400).json({ error: 'Standard plan unavailable' });
      const session = await stripe.checkout.sessions.create({
        customer_email: req.body.email,
        mode: 'subscription',
        line_items: [{ price: standardPrice, quantity: 1 }],
        success_url: `${process.env.APP_BASE_URL}/billing/success`,
        cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
        metadata: { user_id: user.id, plan: 'starter' },
      });
      await supabaseService
        .from('billing_pending')
        .insert({ user_id: user.id, checkout_session_id: session.id, plan_type: 'starter' });
      return res.json({ url: session.url });
    }
  }

  if (!planConfig.priceId) {
    await supabaseService.from('billing').upsert({ user_id: user.id, plan_type: 'free', quota_per_month: 20, status: 'active' });
    return res.json({ url: `${process.env.APP_BASE_URL}/dashboard` });
  }

  const session = await stripe.checkout.sessions.create({
    customer_email: req.body.email,
    mode: 'subscription',
    line_items: [{ price: planConfig.priceId, quantity: 1 }],
    success_url: `${process.env.APP_BASE_URL}/billing/success`,
    cancel_url: `${process.env.APP_BASE_URL}/billing/cancel`,
    metadata: { user_id: user.id, plan },
  });

  await supabaseService.from('billing_pending').insert({ user_id: user.id, checkout_session_id: session.id, plan_type: plan });
  res.json({ url: session.url });
});

router.get('/quota', async (req, res) => {
  const user = req.user;
  if (!user) return res.status(401).json({ error: 'Unauthorized' });
  const { data } = await supabaseService.from('billing').select('*').eq('user_id', user.id).maybeSingle();
  res.json(data || { plan_type: 'free', quota_per_month: 20, quota_used: 0 });
});

export default router;
