'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { getClient } from '../../../lib/supabaseClient';
import { Database } from '../../../lib/types';

type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

const platformLabels: Record<string, string> = {
  ig: 'Instagram',
  facebook: 'Facebook',
  linkedin: 'LinkedIn',
  youtube_draft: 'YouTube',
};

export default function ScheduleDetailPage() {
  const supabase = getClient();
  const params = useParams<{ id: string }>();
  const [session, setSession] = useState<Session | null>(null);
  const [schedule, setSchedule] = useState<ScheduleRow | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  const token = useMemo(() => session?.access_token, [session]);

  useEffect(() => {
    if (!token || !params?.id) return;
    const load = async () => {
      const res = await fetch(`/api/schedule/${params.id}`, { headers: { Authorization: `Bearer ${token}` } });
      const data: ScheduleRow = await res.json();
      setSchedule(data);
    };
    void load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [params?.id, token]);

  if (!schedule) return <div className="p-6">Loading schedule...</div>;

  const showFallback = schedule.status === 'failed' && schedule.fallback_sent;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Schedule details</h1>
      <div className="border rounded p-4 space-y-2">
        <p className="font-semibold">Platform: {platformLabels[schedule.platform] || schedule.platform}</p>
        <p>Status: {schedule.status}</p>
        <p>Scheduled for: {new Date(schedule.scheduled_time).toLocaleString()}</p>
        {schedule.published_url && <p>Published URL: {schedule.published_url}</p>}
        {schedule.last_error && <p className="text-red-600">Last error: {schedule.last_error}</p>}
        <p>Tries: {schedule.tries}</p>
      </div>
      {showFallback && (
        <div className="border-l-4 border-red-600 bg-red-50 p-4 space-y-2">
          <h2 className="font-semibold text-red-700">Failed after 4 attempts</h2>
          <p className="text-sm">Publish manually now using the content below.</p>
          <pre className="bg-white p-3 rounded text-sm overflow-auto">{JSON.stringify(schedule.platform_text, null, 2)}</pre>
          {schedule.last_error && <p className="text-sm text-red-700">Reason: {schedule.last_error}</p>}
          <p className="text-xs text-gray-600">Signed media links were emailed to you.</p>
        </div>
      )}
    </div>
  );
}
