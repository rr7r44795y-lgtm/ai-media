# Deployment Notes

## Frontend (Vercel)
- Framework: Next.js 14 (App Router)
- Build command: `npm run build`
- Install command: `npm install`
- Output directory: `.next`
- Environment variables:
  - `NEXT_PUBLIC_SUPABASE_URL`
  - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
  - `NEXT_PUBLIC_BACKEND_URL` (point to Render/Railway backend)
- Rewrites: handled in `next.config.mjs` to proxy `/api/*` to backend.

## Backend (Render/Railway)
- Runtime: Node 18+
- Install command: `npm install`
- Build command: `npm run build`
- Start command: `node dist/index.js`
- Healthcheck: `GET /health`
- Environment variables: see `backend/.env.example`
- Postgres: connect Supabase Postgres or managed Postgres; run migrations in `backend/db/migrations` (including RLS)
- Cron: scheduler can be invoked via external cron hitting `/api/worker/publish?id=...` is queued by in-app cron; ensure process stays warm.
- Stripe webhook: point to `/api/billing/webhook`

## Supabase
- Run SQL migrations from `backend/db/migrations` in order.
- Ensure storage bucket named `content` exists and is private.
- RLS must be enabled (policies defined in SQL).

## Worker
- Worker shares the same service; ensure `WORKER_ENDPOINT` points to public backend URL so cron can POST `/api/worker/publish`.
