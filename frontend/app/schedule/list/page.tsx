'use client';

import { useEffect, useMemo, useState } from 'react';
import { Session } from '@supabase/supabase-js';
import Link from 'next/link';
import { getClient } from '../../../lib/supabaseClient';
import { Database } from '../../../lib/types';

type ScheduleRow = Database['public']['Tables']['schedules']['Row'];

export default function ScheduleListPage() {
  const supabase = getClient();
  const [session, setSession] = useState<Session | null>(null);
  const [schedules, setSchedules] = useState<ScheduleRow[]>([]);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  const token = useMemo(() => session?.access_token, [session]);

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const res = await fetch('/api/schedule/list', { headers: { Authorization: `Bearer ${token}` } });
      const data: ScheduleRow[] = await res.json();
      setSchedules(data);
    };
    void load();
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [token]);

  if (!session) return <div className="p-6">Loading...</div>;

  return (
    <div className="p-6 space-y-4">
      <h1 className="text-2xl font-semibold">Scheduled posts</h1>
      <div className="grid gap-3">
        {schedules.map((s) => (
          <div key={s.id} className="border rounded p-3 flex items-center justify-between">
            <div>
              <p className="font-semibold">{s.platform.toUpperCase()}</p>
              <p className="text-sm text-gray-600">{new Date(s.scheduled_time).toLocaleString()}</p>
              <p className="text-xs">Status: {s.status}</p>
            </div>
            <Link className="text-indigo-600 underline" href={`/schedule/${s.id}`}>
              View details
            </Link>
          </div>
        ))}
      </div>
    </div>
  );
}
