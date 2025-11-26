export type Json = string | number | boolean | null | { [key: string]: Json } | Json[];

export type Database = {
  public: {
    Tables: {
      contents: {
        Row: {
          id: string;
          user_id: string;
          type: 'image' | 'video' | 'text';
          url: string;
          text: string | null;
          created_at: string;
        };
        Insert: Partial<Row>;
        Update: Partial<Row>;
      };
      social_accounts: {
        Row: {
          id: string;
          user_id: string;
          platform: string;
          external_account_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
          created_at: string;
        };
        Insert: Partial<Row>;
        Update: Partial<Row>;
      };
      billing: {
        Row: {
          user_id: string;
          plan_type: string;
          quota_per_month: number;
          quota_used: number;
          status: string;
          next_billing_at: string | null;
        };
        Insert: Partial<Row>;
        Update: Partial<Row>;
      };
    };
  };
};
