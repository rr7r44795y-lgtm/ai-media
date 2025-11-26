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
        Insert: Partial<{
          id: string;
          user_id: string;
          type: 'image' | 'video' | 'text';
          url: string;
          text: string | null;
          created_at: string;
        }>;
        Update: Partial<{
          id: string;
          user_id: string;
          type: 'image' | 'video' | 'text';
          url: string;
          text: string | null;
          created_at: string;
        }>;
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
        Insert: Partial<{
          id: string;
          user_id: string;
          platform: string;
          external_account_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
          created_at: string;
        }>;
        Update: Partial<{
          id: string;
          user_id: string;
          platform: string;
          external_account_id: string;
          access_token_encrypted: string;
          refresh_token_encrypted: string;
          expires_at: string;
          created_at: string;
        }>;
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
        Insert: Partial<{
          user_id: string;
          plan_type: string;
          quota_per_month: number;
          quota_used: number;
          status: string;
          next_billing_at: string | null;
        }>;
        Update: Partial<{
          user_id: string;
          plan_type: string;
          quota_per_month: number;
          quota_used: number;
          status: string;
          next_billing_at: string | null;
        }>;
      };
      schedules: {
        Row: {
          id: string;
          user_id: string;
          platform: string;
          content_id: string;
          platform_text: Record<string, unknown> | string;
          scheduled_time: string;
          status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
          tries: number;
          last_error: string | null;
          published_url: string | null;
          next_retry_at: string | null;
          processing_started_at: string | null;
          fallback_sent: boolean;
          fallback_sent_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: Partial<{
          id: string;
          user_id: string;
          platform: string;
          content_id: string;
          platform_text: Record<string, unknown> | string;
          scheduled_time: string;
          status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
          tries: number;
          last_error: string | null;
          published_url: string | null;
          next_retry_at: string | null;
          processing_started_at: string | null;
          fallback_sent: boolean;
          fallback_sent_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
        Update: Partial<{
          id: string;
          user_id: string;
          platform: string;
          content_id: string;
          platform_text: Record<string, unknown> | string;
          scheduled_time: string;
          status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
          tries: number;
          last_error: string | null;
          published_url: string | null;
          next_retry_at: string | null;
          processing_started_at: string | null;
          fallback_sent: boolean;
          fallback_sent_at: string | null;
          created_at: string;
          updated_at: string;
        }>;
      };
      feedback: {
        Row: {
          id: string;
          user_id: string;
          type: string;
          message: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
          status: string;
        };
        Insert: Partial<{
          id: string;
          user_id: string;
          type: string;
          message: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
          status: string;
        }>;
        Update: Partial<{
          id: string;
          user_id: string;
          type: string;
          message: string;
          metadata: Record<string, unknown> | null;
          created_at: string;
          status: string;
        }>;
      };
    };
  };
};

export type ScheduleCalendarItem = {
  id: string;
  platform: string;
  scheduled_time: string;
  status: 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';
  platform_text_preview: string;
  content_id: string;
  tries: number;
};
