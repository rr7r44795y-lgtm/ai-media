import React from 'react';
import { ScheduleCalendarItem } from '../lib/types';
import { CalendarEventItem } from './CalendarEventItem';
import { formatDateKey } from '../lib/calendar';

interface Props {
  date: Date;
  events: ScheduleCalendarItem[];
  inCurrentMonth: boolean;
  onSelect: (id: string) => void;
}

export function CalendarCell({ date, events, inCurrentMonth, onSelect }: Props) {
  const isToday = formatDateKey(date) === formatDateKey(new Date());
  return (
    <div
      className={`flex min-h-[120px] flex-col gap-2 border border-slate-200 p-2 ${inCurrentMonth ? 'bg-white' : 'bg-slate-50'} ${
        isToday ? 'ring-2 ring-emerald-500' : ''
      }`}
    >
      <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
        <span>{date.getUTCDate()}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 overflow-hidden">
        {events.length === 0 ? (
          <span className="text-xs text-slate-400">No posts</span>
        ) : (
          events.map((event) => <CalendarEventItem key={event.id} item={event} onClick={onSelect} />)
        )}
      </div>
    </div>
  );
}
