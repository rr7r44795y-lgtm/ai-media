export interface AuthenticatedUser {
  id: string;
  token: string;
}

export type ScheduleStatus = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';

export interface ScheduleRecord {
  id: string;
  user_id: string;
  platform: string;
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

export interface WorkerPublishResult {
  success: boolean;
  url?: string;
  error?: string;
}

export interface FeedbackPayload {
  type: 'bug' | 'feature' | 'billing' | 'oauth' | 'publish-error';
  message: string;
  metadata?: Record<string, unknown>;
}
