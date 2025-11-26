'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Session } from '@supabase/supabase-js';
import { getClient } from '../../lib/supabaseClient';
import { ScheduleCalendarItem } from '../../lib/types';
import { CalendarCell } from '../../components/CalendarCell';
import { CalendarEventItem } from '../../components/CalendarEventItem';
import {
  formatDateKey,
  getMonthGrid,
  getMonthVisibleRange,
  getWeekDays,
  isoDateString,
  startOfWeek,
  endOfWeek,
} from '../../lib/calendar';

type Mode = 'month' | 'week';

export default function CalendarPage() {
  const supabase = getClient();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());
  const [calendarData, setCalendarData] = useState<ScheduleCalendarItem[]>([]);
  const [loadingData, setLoadingData] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  const token = useMemo(() => session?.access_token, [session]);

  const { start, end } = useMemo(() => {
    if (mode === 'month') {
      return getMonthVisibleRange(anchorDate);
    }
    return { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) };
  }, [anchorDate, mode]);

  const startParam = useMemo(() => isoDateString(start), [start]);
  const endParam = useMemo(() => isoDateString(end), [end]);

  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    setLoadingData(true);
    setLoadError(null);
    fetch(`/api/schedule/calendar?start=${startParam}&end=${endParam}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: controller.signal,
    })
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => ({}))) as { error?: string };
          throw new Error(body.error || 'Unable to load calendar');
        }
        return res.json() as Promise<ScheduleCalendarItem[]>;
      })
      .then(setCalendarData)
      .catch((err: Error) => setLoadError(err.message))
      .finally(() => setLoadingData(false));

    return () => controller.abort();
  }, [token, startParam, endParam]);

  const eventMap = useMemo(() => {
    const map: Record<string, ScheduleCalendarItem[]> = {};
    (calendarData || []).forEach((item) => {
      const key = item.scheduled_time.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [calendarData]);

  const monthGrid = useMemo(() => getMonthGrid(anchorDate), [anchorDate]);
  const weekDays = useMemo(() => getWeekDays(anchorDate), [anchorDate]);

  const handleNavigate = (direction: 'prev' | 'next') => {
    setAnchorDate((prev) => {
      const copy = new Date(prev);
      if (mode === 'month') {
        copy.setUTCMonth(copy.getUTCMonth() + (direction === 'next' ? 1 : -1));
      } else {
        copy.setUTCDate(copy.getUTCDate() + (direction === 'next' ? 7 : -7));
      }
      return copy;
    });
  };

  const handleToday = () => {
    setAnchorDate(new Date());
  };

  const onSelectEvent = (id: string) => {
    router.push(`/schedule/${id}`);
  };

  const renderMobile = () => {
    const days = mode === 'month' ? monthGrid.flat() : weekDays;
    return (
      <div className="space-y-3 md:hidden">
        {days.map((day) => {
          const key = formatDateKey(day);
          const events = eventMap[key] || [];
          const isCurrentMonth = day.getUTCMonth() === anchorDate.getUTCMonth();
          return (
            <div key={key} className={`rounded border p-3 ${isCurrentMonth ? 'bg-white' : 'bg-slate-50'}`}>
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-xs uppercase tracking-wide text-slate-500">
                    {day.toLocaleDateString(undefined, { weekday: 'short' })}
                  </p>
                  <p className="text-lg font-semibold text-slate-800">{day.getUTCDate()}</p>
                </div>
                {formatDateKey(day) === formatDateKey(new Date()) && (
                  <span className="rounded-full bg-emerald-100 px-2 py-1 text-[11px] font-semibold text-emerald-700">Today</span>
                )}
              </div>
              <div className="mt-3 space-y-2">
                {events.length === 0 ? (
                  <p className="text-xs text-slate-500">No posts</p>
                ) : (
                  events.map((item) => <CalendarEventItem key={item.id} item={item} onClick={onSelectEvent} />)
                )}
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Publishing calendar</h1>
          <p className="text-sm text-slate-500">See all scheduled and retried posts.</p>
          {loadingData && <p className="text-xs text-slate-500">Syncing...</p>}
          {loadError && <p className="text-xs text-red-600">{loadError}</p>}
        </div>
        <div className="flex gap-2">
          <button className="rounded border px-3 py-2" onClick={handleToday}>
            Today
          </button>
          <button className="rounded border px-3 py-2" onClick={() => handleNavigate('prev')}>
            Prev
          </button>
          <button className="rounded border px-3 py-2" onClick={() => handleNavigate('next')}>
            Next
          </button>
          <select className="rounded border px-3 py-2" value={mode} onChange={(e) => setMode(e.target.value as Mode)}>
            <option value="month">Month</option>
            <option value="week">Week</option>
          </select>
        </div>
      </div>

      <div className="md:hidden">{renderMobile()}</div>

      <div className="hidden md:block">
        {mode === 'month' ? (
          <div className="grid grid-cols-7 gap-2 rounded border bg-white p-4 shadow">
            {monthGrid.map((week, weekIndex) => (
              <div key={weekIndex} className="space-y-2">
                {week.map((day) => {
                  const key = formatDateKey(day);
                  const events = eventMap[key] || [];
                  const isToday = formatDateKey(day) === formatDateKey(new Date());
                  const isCurrentMonth = day.getUTCMonth() === anchorDate.getUTCMonth();
                  return (
                    <CalendarCell
                      key={key}
                      date={day}
                      events={events}
                      onSelect={onSelectEvent}
                      inCurrentMonth={isCurrentMonth}
                    />
                  );
                })}
              </div>
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-7 gap-2 rounded border bg-white p-4 shadow">
            {weekDays.map((day) => {
              const key = formatDateKey(day);
              const events = eventMap[key] || [];
              return (
                <CalendarCell key={key} date={day} events={events} onSelect={onSelectEvent} inCurrentMonth />
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
