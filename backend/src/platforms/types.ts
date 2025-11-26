export interface SocialAccount {
  id: string;
  user_id: string;
  platform: string;
  external_account_id: string;
  access_token_encrypted: string;
  refresh_token_encrypted: string;
  expires_at: string | null;
}
