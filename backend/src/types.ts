export interface AuthenticatedUser {
  id: string;
  token: string;
}

export type SocialPlatform = 'instagram_business' | 'facebook_page' | 'linkedin' | 'youtube_draft';

export interface OAuthTokenResult {
  platform: SocialPlatform;
  external_account_id: string;
  access_token: string;
  refresh_token?: string | null;
  expires_at: Date | null;
}

export type ScheduleStatus = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';

export interface ScheduleRecord {
  id: string;
  user_id: string;
  platform: SocialPlatform;
  content_id: string;
  platform_text: unknown;
  scheduled_time: string;
  status: ScheduleStatus;
  tries: number;
  last_error: string | null;
  published_url: string | null;
  next_retry_at: string | null;
  processing_started_at: string | null;
  fallback_sent: boolean;
  fallback_sent_at: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ScheduleCalendarItem {
  id: string;
  platform: SocialPlatform;
  scheduled_time: string;
  status: ScheduleStatus;
  platform_text_preview: string;
  content_id: string;
  tries: number;
}

export interface WorkerPublishResult {
  success: boolean;
  url?: string;
  error?: string;
  fatal?: boolean;
  fallback_links?: string[];
}

export type WorkerRequest = {
  id: string;
};

export type WorkerError = {
  error: string;
};

export interface FeedbackPayload {
  type: 'bug' | 'feature' | 'billing' | 'oauth' | 'publish-error';
  message: string;
  metadata?: Record<string, unknown>;
}

export interface InstagramPublishResult {
  container_id: string;
  media_id: string;
  permalink: string;
}
