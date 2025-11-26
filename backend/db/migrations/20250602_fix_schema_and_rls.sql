-- Align platform enums, add missing fields, and fix RLS policies

-- Normalize existing platform values in schedules
update schedules set platform = 'instagram_business' where platform in ('ig', 'instagram_business', 'instagram');
update schedules set platform = 'facebook_page' where platform in ('facebook', 'facebook_page');
update schedules set platform = 'youtube_draft' where platform in ('youtube', 'youtube_draft');

-- Normalize existing platform values in social_accounts
update social_accounts set platform = 'instagram_business' where platform in ('ig', 'instagram', 'instagram_business');
update social_accounts set platform = 'facebook_page' where platform in ('facebook', 'facebook_page');
update social_accounts set platform = 'youtube_draft' where platform in ('youtube', 'youtube_draft');

-- Drop old platform constraints
alter table if exists schedules drop constraint if exists schedules_platform_check;
alter table if exists social_accounts drop constraint if exists social_accounts_platform_check;

-- Ensure platform columns are text
alter table if exists schedules alter column platform type text using platform::text;
alter table if exists social_accounts alter column platform type text using platform::text;

-- Apply canonical platform checks
alter table if exists schedules
  add constraint schedules_platform_canonical_check
  check (platform in ('instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'));

alter table if exists social_accounts
  add constraint social_accounts_platform_canonical_check
  check (platform in ('instagram_business', 'facebook_page', 'linkedin', 'youtube_draft'));

-- Add missing schedule fields
alter table if exists schedules add column if not exists fallback_sent boolean not null default false;
alter table if exists schedules add column if not exists fallback_sent_at timestamp with time zone;

-- Ensure billing_pending has status column
alter table if exists billing_pending add column if not exists status text not null default 'pending';
alter table if exists billing_pending alter column status set default 'pending';

-- RLS for gdpr_deletes
alter table if exists gdpr_deletes enable row level security;
drop policy if exists gdpr_owner on gdpr_deletes;
drop policy if exists gdpr_select_owner on gdpr_deletes;
drop policy if exists gdpr_insert_owner on gdpr_deletes;
drop policy if exists gdpr_update_service on gdpr_deletes;
create policy gdpr_select_owner on gdpr_deletes for select using (auth.uid() = user_id);
create policy gdpr_insert_owner on gdpr_deletes for insert with check (auth.uid() = user_id);
create policy gdpr_update_service on gdpr_deletes for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- RLS for billing_pending
alter table if exists billing_pending enable row level security;
drop policy if exists billing_pending_owner_select on billing_pending;
drop policy if exists billing_pending_owner_insert on billing_pending;
drop policy if exists billing_pending_owner_delete on billing_pending;
drop policy if exists billing_pending_update_service on billing_pending;
create policy billing_pending_owner_select on billing_pending for select using (auth.uid() = user_id);
create policy billing_pending_owner_insert on billing_pending for insert with check (auth.uid() = user_id);
create policy billing_pending_owner_delete on billing_pending for delete using (auth.uid() = user_id);
create policy billing_pending_update_service on billing_pending for update using (auth.role() = 'service_role') with check (auth.role() = 'service_role');

-- RLS for social_accounts
alter table if exists social_accounts enable row level security;
drop policy if exists social_accounts_owner_select on social_accounts;
drop policy if exists social_accounts_owner_insert on social_accounts;
drop policy if exists social_accounts_owner_update on social_accounts;
drop policy if exists social_accounts_owner_delete on social_accounts;
create policy social_accounts_owner_select on social_accounts for select using (auth.uid() = user_id);
create policy social_accounts_owner_insert on social_accounts for insert with check (auth.uid() = user_id);
create policy social_accounts_owner_update on social_accounts for update using (auth.uid() = user_id);
create policy social_accounts_owner_delete on social_accounts for delete using (auth.uid() = user_id);

-- Foreign keys
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'schedules_content_id_fkey'
      AND table_name = 'schedules'
  ) THEN
    ALTER TABLE schedules
      ADD CONSTRAINT schedules_content_id_fkey FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'content_tags_content_id_fkey'
      AND table_name = 'content_tags'
  ) THEN
    ALTER TABLE content_tags
      ADD CONSTRAINT content_tags_content_id_fkey FOREIGN KEY (content_id) REFERENCES contents(id) ON DELETE CASCADE;
  END IF;
END$$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'content_tags_tag_id_fkey'
      AND table_name = 'content_tags'
  ) THEN
    ALTER TABLE content_tags
      ADD CONSTRAINT content_tags_tag_id_fkey FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE;
  END IF;
END$$;
