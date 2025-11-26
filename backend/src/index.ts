import express, { raw } from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import cookieParser from 'cookie-parser';
import authMiddleware from './middleware/authMiddleware.js';
import contentRouter from './routes/content.js';
import oauthRouter from './routes/oauth.js';
import oauthAccountsRouter from './routes/oauthAccounts.js';
import billingRouter from './routes/billing.js';
import billingWebhookRouter from './routes/billingWebhook.js';
import formatRouter from './routes/format.js';
import scheduleRouter from './routes/schedule.js';
import scheduleDetailRouter from './routes/scheduleDetail.js';
import tagRouter from './routes/tags.js';
import workerRouter from './routes/worker.js';
import feedbackRouter from './routes/feedback.js';
import gdprRouter from './routes/gdpr.js';
import { startCron } from './services/cron.js';
import { supabaseService } from './utils/supabaseClient.js';

dotenv.config();

const app = express();
app.use('/api/billing/webhook', raw({ type: 'application/json' }), billingWebhookRouter);
app.use(bodyParser.json());
app.use(cookieParser());

app.use('/api/content', authMiddleware, contentRouter);
app.use('/api/oauth/accounts', authMiddleware, oauthAccountsRouter);
app.use('/api/oauth', oauthRouter);
app.use('/api/billing', authMiddleware, billingRouter);
app.use('/api/format', authMiddleware, formatRouter);
app.use('/api/schedule', authMiddleware, scheduleDetailRouter);
app.use('/api/schedule', authMiddleware, scheduleRouter);
app.use('/api/tags', authMiddleware, tagRouter);
app.use('/api/feedback', authMiddleware, feedbackRouter);
app.use('/api/gdpr', gdprRouter);
app.use('/api/worker', workerRouter);

app.get('/health', async (_req, res) => {
  const { data } = await supabaseService
    .from('scheduler_heartbeat')
    .select('ran_at')
    .order('ran_at', { ascending: false })
    .limit(1);
  res.json({ status: 'ok', last_heartbeat: data?.[0]?.ran_at || null });
});
app.get('/api/health', async (_req, res) => {
  const { data } = await supabaseService
    .from('scheduler_heartbeat')
    .select('ran_at')
    .order('ran_at', { ascending: false })
    .limit(1);
  res.json({ status: 'ok', last_heartbeat: data?.[0]?.ran_at || null });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

startCron();
