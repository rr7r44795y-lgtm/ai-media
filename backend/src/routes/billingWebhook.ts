import { Router } from 'express';
import Stripe from 'stripe';
import { supabaseService } from '../utils/supabaseClient.js';

const router = Router();
const stripeSecret = process.env.STRIPE_SECRET_KEY || '';
const stripeWebhookSecret = process.env.STRIPE_WEBHOOK_SECRET || '';
const stripe = new Stripe(stripeSecret, { apiVersion: '2023-10-16' });

const plans = {
  free: { quota: 20 },
  starter: { quota: 999 },
  annual: { quota: 999 },
  intro: { quota: 30 },
};

router.post('/', async (req, res) => {
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
      const userId = session.metadata?.user_id;
      const requestedPlan = (session.metadata?.plan as keyof typeof plans | undefined) || 'starter';
      if (!userId) break;

      const { data: existing } = await supabaseService
        .from('billing')
        .select('intro_used')
        .eq('user_id', userId)
        .maybeSingle();

      const introAlreadyUsed = existing?.intro_used;
      const planToApply: keyof typeof plans = requestedPlan === 'intro' && introAlreadyUsed ? 'starter' : requestedPlan;
      const quota = plans[planToApply]?.quota || 20;
      await supabaseService.from('billing').upsert({
        user_id: userId,
        plan_type: planToApply,
        quota_per_month: quota,
        quota_used: 0,
        stripe_customer_id: session.customer as string,
        stripe_subscription_id: session.subscription as string,
        status: 'active',
        intro_used: introAlreadyUsed || requestedPlan === 'intro',
      });

      await supabaseService
        .from('billing_pending')
        .update({ status: 'completed' })
        .eq('checkout_session_id', session.id)
        .eq('user_id', userId);
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

export default router;
