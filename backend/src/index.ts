import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import authMiddleware from './middleware/authMiddleware.js';
import contentRouter from './routes/content.js';
import oauthRouter from './routes/oauth.js';
import billingRouter from './routes/billing.js';
import formatRouter from './routes/format.js';
import scheduleRouter from './routes/schedule.js';
import tagRouter from './routes/tags.js';
import workerRouter from './routes/worker.js';
import feedbackRouter from './routes/feedback.js';
import { startCron } from './services/cron.js';

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.use('/api/content', authMiddleware, contentRouter);
app.use('/api/oauth', authMiddleware, oauthRouter);
app.use('/api/billing', authMiddleware, billingRouter);
app.use('/api/format', authMiddleware, formatRouter);
app.use('/api/schedule', authMiddleware, scheduleRouter);
app.use('/api/tags', authMiddleware, tagRouter);
app.use('/api/feedback', authMiddleware, feedbackRouter);
app.use('/api/worker', workerRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});

startCron();
