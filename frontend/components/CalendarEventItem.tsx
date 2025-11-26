import React from 'react';
import { ScheduleCalendarItem } from '../lib/types';
import { PlatformIcon } from './PlatformIcon';
import { StatusBadge } from './StatusBadge';
import { safeTruncate } from '../lib/text';

interface Props {
  item: ScheduleCalendarItem;
  onClick: (id: string) => void;
}

export function CalendarEventItem({ item, onClick }: Props) {
  return (
    <button
      type="button"
      onClick={() => onClick(item.id)}
      className="flex w-full items-center justify-between rounded border border-slate-200 bg-white px-2 py-1 text-left shadow-sm transition hover:border-slate-300 hover:shadow"
    >
      <div className="flex items-center gap-2 overflow-hidden">
        <PlatformIcon platform={item.platform} />
        <span className="truncate text-sm text-slate-800">
          {safeTruncate(item.platform_text_preview, 20)}
        </span>
      </div>
      <StatusBadge status={item.status} />
    </button>
  );
}
