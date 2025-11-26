-- Initialize missing tables for contents, tags, schedules, billing, oauth, and compliance

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Contents store uploaded assets and text snippets
create table if not exists contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('image','video','text')),
  url text not null,
  bucket text,
  path text,
  text text,
  created_at timestamp with time zone not null default now()
);

alter table contents enable row level security;
create policy if not exists "contents_owner_select" on contents for select using (auth.uid() = user_id);
create policy if not exists "contents_owner_insert" on contents for insert with check (auth.uid() = user_id);
create policy if not exists "contents_owner_update" on contents for update using (auth.uid() = user_id);
create policy if not exists "contents_owner_delete" on contents for delete using (auth.uid() = user_id);

-- Tags and tagging
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone not null default now()
);

alter table tags enable row level security;
create policy if not exists "tags_owner_select" on tags for select using (auth.uid() = user_id);
create policy if not exists "tags_owner_insert" on tags for insert with check (auth.uid() = user_id);
create policy if not exists "tags_owner_update" on tags for update using (auth.uid() = user_id);
create policy if not exists "tags_owner_delete" on tags for delete using (auth.uid() = user_id);

create table if not exists content_tags (
  id uuid primary key default gen_random_uuid(),
  content_id uuid not null references contents(id) on delete cascade,
  tag_id uuid not null references tags(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamp with time zone not null default now(),
  deleted_at timestamp with time zone,
  unique (content_id, tag_id)
);

alter table content_tags enable row level security;
create policy if not exists "content_tags_owner_select" on content_tags for select using (auth.uid() = user_id);
create policy if not exists "content_tags_owner_insert" on content_tags for insert with check (auth.uid() = user_id);
create policy if not exists "content_tags_owner_update" on content_tags for update using (auth.uid() = user_id);
create policy if not exists "content_tags_owner_delete" on content_tags for delete using (auth.uid() = user_id);

-- Social accounts and OAuth state
create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ig','facebook','linkedin','youtube_draft','instagram_business','facebook_page')),
  external_account_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamp with time zone,
  scopes text[] default '{}',
  disabled boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now(),
  unique (user_id, platform)
);

alter table social_accounts enable row level security;
create policy if not exists "social_accounts_owner_select" on social_accounts for select using (auth.uid() = user_id);
create policy if not exists "social_accounts_owner_insert" on social_accounts for insert with check (auth.uid() = user_id);
create policy if not exists "social_accounts_owner_update" on social_accounts for update using (auth.uid() = user_id);
create policy if not exists "social_accounts_owner_delete" on social_accounts for delete using (auth.uid() = user_id);

create table if not exists oauth_states (
  state text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  redirect_after text,
  created_at timestamp with time zone not null default now()
);

-- Scheduling
create table if not exists schedules (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  platform text not null check (platform in ('ig','facebook','linkedin','youtube_draft')),
  content_id uuid not null references contents(id) on delete cascade,
  platform_text jsonb not null,
  scheduled_time timestamp with time zone not null,
  status text not null default 'pending' check (status in ('pending','processing','success','failed','cancelled')),
  tries int not null default 0,
  last_error text,
  published_url text,
  next_retry_at timestamp with time zone,
  processing_started_at timestamp with time zone,
  fallback_sent boolean not null default false,
  fallback_sent_at timestamp with time zone,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table schedules enable row level security;
create policy if not exists "schedules_owner" on schedules for select using (auth.uid() = user_id);
create policy if not exists "schedules_owner_ins" on schedules for insert with check (auth.uid() = user_id);
create policy if not exists "schedules_owner_upd" on schedules for update using (auth.uid() = user_id);

-- Scheduler heartbeat
create table if not exists scheduler_heartbeat (
  id bigserial primary key,
  ran_at timestamp with time zone not null default now()
);

-- Feedback table
create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamp with time zone not null default now(),
  status text not null default 'open'
);
alter table feedback enable row level security;
create policy if not exists "feedback_owner" on feedback for select using (auth.uid() = user_id);
create policy if not exists "feedback_owner_ins" on feedback for insert with check (auth.uid() = user_id);

-- GDPR delete queue
create table if not exists gdpr_deletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  queued_at timestamp with time zone not null default now(),
  processed_at timestamp with time zone,
  status text not null default 'queued'
);
alter table gdpr_deletes enable row level security;
create policy if not exists "gdpr_owner" on gdpr_deletes for select using (auth.uid() = user_id);

-- Billing
create table if not exists billing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_type text not null,
  quota_per_month integer not null default 30,
  quota_used integer not null default 0,
  next_billing_at timestamp with time zone,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'active',
  intro_used boolean not null default false,
  created_at timestamp with time zone not null default now(),
  updated_at timestamp with time zone not null default now()
);

alter table billing enable row level security;
create policy if not exists "billing_owner_select" on billing for select using (auth.uid() = user_id);
create policy if not exists "billing_owner_insert" on billing for insert with check (auth.uid() = user_id);
create policy if not exists "billing_owner_update" on billing for update using (auth.uid() = user_id);

create table if not exists billing_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  checkout_session_id text,
  plan_type text not null,
  created_at timestamp with time zone not null default now(),
  status text not null default 'pending'
);

alter table billing_pending enable row level security;
create policy if not exists "billing_pending_owner_select" on billing_pending for select using (auth.uid() = user_id);
create policy if not exists "billing_pending_owner_insert" on billing_pending for insert with check (auth.uid() = user_id);
create policy if not exists "billing_pending_owner_delete" on billing_pending for delete using (auth.uid() = user_id);

-- Storage metadata for audit
create table if not exists storage_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket text not null,
  path text not null,
  created_at timestamp with time zone not null default now()
);

alter table storage_audit enable row level security;
create policy if not exists "storage_audit_owner_select" on storage_audit for select using (auth.uid() = user_id);
create policy if not exists "storage_audit_owner_insert" on storage_audit for insert with check (auth.uid() = user_id);

-- Simple persistent rate limiter window per platform
create table if not exists publisher_rate_limits (
  platform text primary key,
  window_start timestamp with time zone not null default now(),
  count integer not null default 0
);

-- Indexes
create index if not exists contents_user_idx on contents(user_id);
create index if not exists tags_user_idx on tags(user_id);
create index if not exists content_tags_content_idx on content_tags(content_id);
create index if not exists social_accounts_user_platform_idx on social_accounts(user_id, platform);
create index if not exists billing_user_idx on billing(user_id);
create index if not exists billing_pending_user_idx on billing_pending(user_id);
create index if not exists schedules_next_retry_idx on schedules(next_retry_at);
