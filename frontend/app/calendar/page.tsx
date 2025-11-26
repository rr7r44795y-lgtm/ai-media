'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import useSWR from 'swr';
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

const calendarFetcher = async (url: string, token: string): Promise<ScheduleCalendarItem[]> => {
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body.error || 'Unable to load calendar');
  }
  return res.json() as Promise<ScheduleCalendarItem[]>;
};

type Mode = 'month' | 'week';

export default function CalendarPage() {
  const supabase = getClient();
  const router = useRouter();
  const [session, setSession] = useState<Session | null>(null);
  const [mode, setMode] = useState<Mode>('month');
  const [anchorDate, setAnchorDate] = useState<Date>(new Date());

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
  }, [supabase]);

  const token = useMemo(() => session?.access_token, [session]);

  const { startDate, endDate } = useMemo(() => {
    if (mode === 'month') {
      return getMonthVisibleRange(anchorDate);
    }
    return { start: startOfWeek(anchorDate), end: endOfWeek(anchorDate) };
  }, [anchorDate, mode]);

  const startParam = useMemo(() => isoDateString(startDate), [startDate]);
  const endParam = useMemo(() => isoDateString(endDate), [endDate]);

  const { data, error, isLoading, mutate } = useSWR(
    token ? [`/api/schedule/calendar?start=${startParam}&end=${endParam}`, token] : null,
    ([url, tok]) => calendarFetcher(url, tok)
  );

  const eventMap = useMemo(() => {
    const map: Record<string, ScheduleCalendarItem[]> = {};
    (data || []).forEach((item) => {
      const key = item.scheduled_time.slice(0, 10);
      if (!map[key]) map[key] = [];
      map[key].push(item);
    });
    return map;
  }, [data]);

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

  const renderDesktopMonth = () => (
    <div className="hidden grid-cols-7 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 md:grid">
      {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
        <div key={d} className="bg-white p-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          {d}
        </div>
      ))}
      {monthGrid.map((week, idx) => (
        <div key={`week-${idx}`} className="contents">
          {week.map((day) => {
            const key = formatDateKey(day);
            const events = eventMap[key] || [];
            return (
              <CalendarCell
                key={key}
                date={day}
                events={events}
                inCurrentMonth={day.getUTCMonth() === anchorDate.getUTCMonth()}
                onSelect={onSelectEvent}
              />
            );
          })}
        </div>
      ))}
    </div>
  );

  const renderDesktopWeek = () => (
    <div className="hidden grid-cols-7 gap-px overflow-hidden rounded border border-slate-200 bg-slate-200 md:grid">
      {weekDays.map((day) => {
        const key = formatDateKey(day);
        const events = eventMap[key] || [];
        return (
          <div key={key} className="bg-white">
            <div className="border-b border-slate-200 p-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
              {day.toLocaleDateString(undefined, { weekday: 'short' })} {day.getUTCDate()}
            </div>
            <div className="p-2">
              <CalendarCell date={day} events={events} inCurrentMonth onSelect={onSelectEvent} />
            </div>
          </div>
        );
      })}
    </div>
  );

  const rangeLabel = `${startDate.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })} - ${endDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;

  if (!session) {
    return <div className="p-6">Loading session...</div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Content Calendar</h1>
          <p className="text-sm text-slate-600">Visualize upcoming posts across platforms.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <div className="flex items-center gap-2 rounded border border-slate-200 bg-white p-2 shadow-sm">
            <button
              type="button"
              onClick={() => handleNavigate('prev')}
              className="rounded bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Prev
            </button>
            <button
              type="button"
              onClick={handleToday}
              className="rounded bg-emerald-100 px-2 py-1 text-sm font-semibold text-emerald-700 hover:bg-emerald-200"
            >
              Today
            </button>
            <button
              type="button"
              onClick={() => handleNavigate('next')}
              className="rounded bg-slate-100 px-2 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-200"
            >
              Next
            </button>
          </div>
          <div className="flex rounded border border-slate-200 bg-white p-1 shadow-sm">
            <button
              type="button"
              onClick={() => setMode('month')}
              className={`rounded px-3 py-1 text-sm font-semibold ${
                mode === 'month' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Month
            </button>
            <button
              type="button"
              onClick={() => setMode('week')}
              className={`rounded px-3 py-1 text-sm font-semibold ${
                mode === 'week' ? 'bg-emerald-600 text-white' : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              Week
            </button>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between">
        <div>
          <p className="text-lg font-semibold text-slate-800">
            {anchorDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}
          </p>
          <p className="text-sm text-slate-600">Showing {rangeLabel}</p>
        </div>
        <button
          type="button"
          onClick={() => mutate()}
          className="rounded border border-slate-200 px-3 py-1 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          Refresh
        </button>
      </div>

      {isLoading && <div className="rounded border border-slate-200 bg-white p-4 text-sm text-slate-600">Loading calendar...</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">{error.message}</div>}

      {data && data.length === 0 && !isLoading && !error && (
        <div className="rounded border border-slate-200 bg-white p-3 text-sm text-slate-600">No scheduled posts in this range.</div>
      )}

      {renderMobile()}

      {mode === 'month' ? renderDesktopMonth() : renderDesktopWeek()}
    </div>
  );
}
