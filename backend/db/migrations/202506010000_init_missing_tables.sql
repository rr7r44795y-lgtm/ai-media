-- Initialize missing tables for contents, tags, social accounts, billing, oauth states

create extension if not exists "uuid-ossp";
create extension if not exists pgcrypto;

-- Contents store uploaded assets and text snippets
create table if not exists contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  type text not null check (type in ('image','video','text')),
  url text not null,
  bucket text,
  path text,
  text text,
  created_at timestamp with time zone default now()
);

alter table contents enable row level security;
create policy if not exists "contents_owner_select" on contents for select using (auth.uid() = user_id);
create policy if not exists "contents_owner_insert" on contents for insert with check (auth.uid() = user_id);
create policy if not exists "contents_owner_update" on contents for update using (auth.uid() = user_id);
create policy if not exists "contents_owner_delete" on contents for delete using (auth.uid() = user_id);

-- Tags and tagging
create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamp with time zone default now()
);

alter table tags enable row level security;
create policy if not exists "tags_owner_select" on tags for select using (auth.uid() = user_id);
create policy if not exists "tags_owner_insert" on tags for insert with check (auth.uid() = user_id);
create policy if not exists "tags_owner_update" on tags for update using (auth.uid() = user_id);
create policy if not exists "tags_owner_delete" on tags for delete using (auth.uid() = user_id);

create table if not exists content_tags (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  created_at timestamp with time zone default now(),
  deleted_at timestamp with time zone
);

alter table content_tags enable row level security;
create policy if not exists "content_tags_owner_select" on content_tags for select using (auth.uid() = user_id);
create policy if not exists "content_tags_owner_insert" on content_tags for insert with check (auth.uid() = user_id);
create policy if not exists "content_tags_owner_update" on content_tags for update using (auth.uid() = user_id);
create policy if not exists "content_tags_owner_delete" on content_tags for delete using (auth.uid() = user_id);

-- Social accounts and OAuth state
create table if not exists social_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  external_account_id text not null,
  access_token_encrypted text not null,
  refresh_token_encrypted text,
  expires_at timestamp with time zone,
  scopes text[],
  disabled boolean default false,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
);

alter table social_accounts enable row level security;
create policy if not exists "social_accounts_owner_select" on social_accounts for select using (auth.uid() = user_id);
create policy if not exists "social_accounts_owner_insert" on social_accounts for insert with check (auth.uid() = user_id);
create policy if not exists "social_accounts_owner_update" on social_accounts for update using (auth.uid() = user_id);
create policy if not exists "social_accounts_owner_delete" on social_accounts for delete using (auth.uid() = user_id);

create table if not exists oauth_states (
  state text primary key,
  user_id uuid references auth.users(id) on delete cascade,
  redirect_after text,
  created_at timestamp with time zone default now()
);

-- Billing
create table if not exists billing (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  plan_type text not null,
  quota_per_month integer not null default 30,
  quota_used integer not null default 0,
  next_billing_at timestamp with time zone,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'active',
  created_at timestamp with time zone default now()
);

alter table billing enable row level security;
create policy if not exists "billing_owner_select" on billing for select using (auth.uid() = user_id);
create policy if not exists "billing_owner_insert" on billing for insert with check (auth.uid() = user_id);
create policy if not exists "billing_owner_update" on billing for update using (auth.uid() = user_id);

create table if not exists billing_pending (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  stripe_checkout_id text,
  plan_type text not null,
  created_at timestamp with time zone default now()
);

alter table billing_pending enable row level security;
create policy if not exists "billing_pending_owner_select" on billing_pending for select using (auth.uid() = user_id);
create policy if not exists "billing_pending_owner_insert" on billing_pending for insert with check (auth.uid() = user_id);
create policy if not exists "billing_pending_owner_delete" on billing_pending for delete using (auth.uid() = user_id);

-- Storage metadata for audit
create table if not exists storage_audit (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  bucket text not null,
  path text not null,
  created_at timestamp with time zone default now()
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
