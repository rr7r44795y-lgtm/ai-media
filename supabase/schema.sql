-- Basic tables aligned with core features
create table if not exists contents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null check (type in ('image','video','text')),
  storage_path text,
  text_content text,
  created_at timestamptz default now()
);

create table if not exists tags (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  name text not null,
  created_at timestamptz default now()
);

create table if not exists content_tags (
  id uuid primary key default gen_random_uuid(),
  content_id uuid references contents(id) on delete cascade,
  tag_id uuid references tags(id) on delete cascade
);

create table if not exists schedules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  platform text not null,
  content_id uuid references contents(id),
  platform_text jsonb not null,
  scheduled_time timestamptz not null,
  status text not null default 'pending',
  tries int not null default 0,
  last_error text,
  next_retry_at timestamptz,
  processing_started_at timestamptz,
  published_url text,
  fallback_sent boolean default false,
  fallback_sent_at timestamptz,
  created_at timestamptz default now()
);

create table if not exists feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  type text not null,
  description text not null,
  schedule_id uuid references schedules(id),
  browser text,
  os text,
  attachment_path text,
  status text not null default 'open',
  created_at timestamptz default now()
);

-- RLS policies assume auth.uid() is available via Supabase.
alter table contents enable row level security;
alter table tags enable row level security;
alter table content_tags enable row level security;
alter table schedules enable row level security;
alter table feedback enable row level security;

create policy contents_owner on contents using (user_id = auth.uid());
create policy tags_owner on tags using (user_id = auth.uid());
create policy content_tags_owner on content_tags using (
  exists (select 1 from contents c where c.id = content_tags.content_id and c.user_id = auth.uid())
);
create policy schedules_owner on schedules using (user_id = auth.uid());
create policy feedback_owner on feedback using (user_id = auth.uid());
