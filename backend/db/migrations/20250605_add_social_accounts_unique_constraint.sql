ALTER TABLE social_accounts
ADD CONSTRAINT social_accounts_unique_user_platform_extacct
UNIQUE (user_id, platform, external_account_id);
