-- Schedules table with status tracking
create table if not exists schedules (
  id uuid primary key,
  user_id uuid references auth.users(id) on delete cascade,
  platform text not null,
  content_id uuid not null,
  platform_text jsonb not null,
  scheduled_time timestamp with time zone not null,
  status text not null default 'pending',
  tries int not null default 0,
  last_error text,
  published_url text,
  next_retry_at timestamp with time zone,
  processing_started_at timestamp with time zone,
  fallback_sent boolean not null default false,
  fallback_sent_at timestamp with time zone,
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now()
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
  user_id uuid references auth.users(id) on delete cascade,
  type text not null,
  message text not null,
  metadata jsonb,
  created_at timestamp with time zone default now(),
  status text not null default 'open'
);
alter table feedback enable row level security;
create policy if not exists "feedback_owner" on feedback for select using (auth.uid() = user_id);
create policy if not exists "feedback_owner_ins" on feedback for insert with check (auth.uid() = user_id);

-- GDPR delete queue
create table if not exists gdpr_deletes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete cascade,
  queued_at timestamp with time zone default now(),
  processed_at timestamp with time zone
);
alter table gdpr_deletes enable row level security;
create policy if not exists "gdpr_owner" on gdpr_deletes for select using (auth.uid() = user_id);

-- Scheduler log index
create index if not exists schedules_next_retry_idx on schedules(next_retry_at);
