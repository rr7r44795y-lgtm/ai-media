import express from 'express';
import bodyParser from 'body-parser';
import dotenv from 'dotenv';
import authMiddleware from './middleware/authMiddleware.js';
import contentRouter from './routes/content.js';
import oauthRouter from './routes/oauth.js';
import billingRouter from './routes/billing.js';

dotenv.config();

const app = express();
app.use(bodyParser.json());

app.use('/api/content', authMiddleware, contentRouter);
app.use('/api/oauth', authMiddleware, oauthRouter);
app.use('/api/billing', authMiddleware, billingRouter);

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

const port = process.env.PORT || 4000;
app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
