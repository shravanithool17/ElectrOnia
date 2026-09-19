import React from 'react';
import { Card } from '../ui';

/**
 * A hero number. Deliberately not a chart: one value with no trend to show is
 * read faster as text than as a shape.
 */
export default function StatTile({ label, value, sublabel, tone = 'default', icon }) {
  const valueTone =
    tone === 'warning' ? 'text-amber-600' : tone === 'danger' ? 'text-red-600' : 'text-slate-900';

  return (
    <Card className="p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
          {label}
        </span>
        {icon && <span className="text-sm" aria-hidden="true">{icon}</span>}
      </div>
      <span className={`text-2xl font-bold tabular-nums leading-tight ${valueTone}`}>{value}</span>
      {sublabel && <span className="text-[11px] text-slate-500">{sublabel}</span>}
    </Card>
  );
}
