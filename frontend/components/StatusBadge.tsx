import React from 'react';

type Status = 'pending' | 'processing' | 'success' | 'failed' | 'cancelled';

const badgeColors: Record<Status, { bg: string; text: string }> = {
  pending: { bg: 'bg-yellow-100', text: 'text-yellow-700' },
  processing: { bg: 'bg-blue-100', text: 'text-blue-700' },
  success: { bg: 'bg-emerald-100', text: 'text-emerald-700' },
  failed: { bg: 'bg-red-100', text: 'text-red-700' },
  cancelled: { bg: 'bg-slate-200', text: 'text-slate-700' },
};

export function StatusBadge({ status }: { status: Status }) {
  const colors = badgeColors[status];
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ${colors.bg} ${colors.text}`}>
      {status}
    </span>
  );
}
