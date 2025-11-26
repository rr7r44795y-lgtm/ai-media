import { Router } from 'express';
import Stripe from 'stripe';
import { supabaseService } from '../utils/supabaseClient.js';

const router = Router();
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

const plans = {
  free: { priceId: null, quota: 20 },
  starter: { priceId: process.env.STRIPE_PRICE_MONTHLY, quota: 999 },
  annual: { priceId: process.env.STRIPE_PRICE_ANNUAL, quota: 999 },
  intro: { priceId: process.env.STRIPE_PRICE_INTRO, quota: 30 },
};

router.post('/create-session', async (req, res) => {
  const user = (req as any).user;
  const { plan } = req.body as { plan: keyof typeof plans };
  const planConfig = plans[plan];
  if (!planConfig) return res.status(400).json({ error: 'Invalid plan' });

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

router.post('/webhook', async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig as string, stripeWebhookSecret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${(err as Error).message}`);
  }

  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      await supabaseService.from('billing').upsert({
        user_id: session.metadata?.user_id,
        plan_type: session.metadata?.plan,
        quota_per_month: plans[session.metadata?.plan as keyof typeof plans]?.quota || 20,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        status: 'active',
      });
      break;
    }
    case 'invoice.payment_failed': {
      const inv = event.data.object as Stripe.Invoice;
      await supabaseService.from('billing').update({ status: 'past_due' }).eq('stripe_subscription_id', inv.subscription);
      break;
    }
    case 'invoice.payment_succeeded': {
      const inv = event.data.object as Stripe.Invoice;
      await supabaseService.from('billing').update({ status: 'active' }).eq('stripe_subscription_id', inv.subscription);
      break;
    }
    case 'customer.subscription.deleted': {
      const sub = event.data.object as Stripe.Subscription;
      await supabaseService.from('billing').update({ status: 'canceled' }).eq('stripe_subscription_id', sub.id);
      break;
    }
    default:
      break;
  }

  res.json({ received: true });
});

router.get('/quota', async (req, res) => {
  const user = (req as any).user;
  const { data } = await supabaseService.from('billing').select('*').eq('user_id', user.id).maybeSingle();
  res.json(data || { plan_type: 'free', quota_per_month: 20, quota_used: 0 });
});

export default router;
