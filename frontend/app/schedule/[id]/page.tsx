'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { getClient } from '../../../lib/supabaseClient';

interface ScheduleRecord {
  id: string;
  platform: string;
  scheduled_time: string;
  status: string;
  tries: number;
  last_error?: string | null;
  fallback_sent?: boolean;
  fallback_sent_at?: string | null;
  published_url?: string | null;
}

export default function ScheduleDetailPage() {
  const supabase = getClient();
  const router = useRouter();
  const params = useParams();
  const scheduleId = params?.id as string;
  const [session, setSession] = useState<Session | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  const token = useMemo(() => session?.access_token, [session]);

  const loadSchedule = async () => {
    if (!token || !scheduleId) return;
    setLoading(true);
    const res = await fetch(`/api/schedule/${scheduleId}`, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      setError(body.error || 'Unable to load schedule');
      setLoading(false);
      return;
    }
    const data = (await res.json()) as ScheduleRecord;
    setSchedule(data);
    setLoading(false);
  };

  useEffect(() => {
    void loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, scheduleId]);

  const cancelSchedule = async () => {
    if (!token || !scheduleId) return;
    const res = await fetch(`/api/schedule/${scheduleId}/cancel`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
    });
    if (res.ok) {
      await loadSchedule();
    } else {
      const body = (await res.json().catch(() => ({}))) as { error?: string };
      alert(body.error || 'Unable to cancel');
    }
  };

  const renderStatus = () => {
    if (!schedule) return null;
    return (
      <div className="space-y-1">
        <p className="text-sm">Status: {schedule.status}</p>
        <p className="text-sm">Scheduled for: {new Date(schedule.scheduled_time).toLocaleString()}</p>
        <p className="text-sm">Tries: {schedule.tries}</p>
        {schedule.published_url && <p className="text-sm">Published URL: {schedule.published_url}</p>}
        {schedule.last_error && <p className="text-sm text-red-600">Last error: {schedule.last_error}</p>}
        {schedule.fallback_sent && (
          <p className="text-sm text-amber-700">
            Fallback sent {schedule.fallback_sent_at ? `at ${new Date(schedule.fallback_sent_at).toLocaleString()}` : ''}
          </p>
        )}
      </div>
    );
  };

  if (!session) return <div className="p-6">Checking session...</div>;
  if (loading) return <div className="p-6">Loading schedule...</div>;
  if (error) return <div className="p-6 text-red-600">{error}</div>;

  return (
    <div className="p-6 space-y-4">
      <button className="text-sm underline" onClick={() => router.back()}>
        Back
      </button>
      <h1 className="text-2xl font-semibold">Schedule Detail</h1>
      <div className="rounded border bg-white p-4 shadow-sm">
        <p className="text-sm font-semibold">Platform: {schedule?.platform}</p>
        {renderStatus()}
      </div>
      <button
        className="rounded bg-red-600 px-4 py-2 text-white disabled:opacity-50"
        onClick={cancelSchedule}
        disabled={!schedule || schedule.status === 'cancelled' || schedule.status === 'success'}
      >
        Cancel schedule
      </button>
    </div>
  );
}
