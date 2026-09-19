import React, { useState } from 'react';
import { formatINR } from '../../lib/money';

/**
 * Revenue over the last N days.
 *
 * One series, so one hue and no legend — the heading names it. Bars rather
 * than a line because the values are daily totals (discrete buckets), not a
 * continuous measurement. Only the peak is direct-labelled; a number on every
 * bar is noise. An equivalent table is rendered for screen readers, so the
 * information is never colour- or shape-only.
 */
export default function RevenueChart({ series, title = 'Revenue', subtitle }) {
  const [hovered, setHovered] = useState(null);

  const max = Math.max(...series.map((d) => d.revenue), 1);
  const peakIndex = series.findIndex((d) => d.revenue === max && d.revenue > 0);
  const hasRevenue = series.some((d) => d.revenue > 0);

  const shortDate = (iso) =>
    new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      timeZone: 'UTC',
    });

  return (
    <figure className="flex flex-col gap-4 m-0">
      <figcaption className="flex items-baseline justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold text-slate-900">{title}</h3>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5">{subtitle}</p>}
        </div>
        {hasRevenue && (
          <span className="text-[11px] text-slate-400 tabular-nums">
            peak {formatINR(max)}
          </span>
        )}
      </figcaption>

      <div className="relative">
        {/* Tooltip. Positioned above the plot so it never covers the bar. */}
        {hovered !== null && (
          <div
            className="absolute -top-1 z-10 -translate-y-full pointer-events-none"
            style={{ left: `${((hovered + 0.5) / series.length) * 100}%`, transform: 'translate(-50%, -100%)' }}
          >
            <div className="bg-slate-900 text-white rounded-lg px-2.5 py-1.5 text-[11px] whitespace-nowrap shadow-lg">
              <div className="font-semibold">{shortDate(series[hovered].date)}</div>
              <div className="tabular-nums">{series[hovered].revenueLabel}</div>
              <div className="text-slate-400">
                {series[hovered].orders} {series[hovered].orders === 1 ? 'order' : 'orders'}
              </div>
            </div>
          </div>
        )}

        {/* 2px gap between bars; 4px rounded tops anchored to the baseline. */}
        <div className="flex items-end gap-[2px] h-32" onMouseLeave={() => setHovered(null)}>
          {series.map((day, index) => {
            const height = day.revenue > 0 ? Math.max(4, (day.revenue / max) * 100) : 2;
            const isPeak = index === peakIndex;
            const isHovered = index === hovered;

            return (
              <div
                key={day.date}
                className="flex-1 h-full flex items-end cursor-default"
                onMouseEnter={() => setHovered(index)}
              >
                <div
                  className={[
                    'w-full rounded-t transition-colors duration-150',
                    day.revenue > 0
                      ? isHovered || isPeak
                        ? 'bg-blue-600'
                        : 'bg-blue-400'
                      : 'bg-slate-200',
                  ].join(' ')}
                  style={{ height: `${height}%` }}
                />
              </div>
            );
          })}
        </div>

        {/* Baseline */}
        <div className="h-px bg-slate-200 mt-0" aria-hidden="true" />

        {/* Only the ends are labelled — 14 date labels would collide. */}
        <div className="flex justify-between mt-1.5 text-[10px] text-slate-400">
          <span>{shortDate(series[0]?.date ?? '')}</span>
          <span>{shortDate(series.at(-1)?.date ?? '')}</span>
        </div>
      </div>

      {!hasRevenue && (
        <p className="text-xs text-slate-400 -mt-2">
          No sales in this period yet — bars will fill as orders come in.
        </p>
      )}

      {/* The same data as a table, for screen readers and for anyone who wants
          the numbers rather than the shape. */}
      <table className="sr-only">
        <caption>{title} by day</caption>
        <thead>
          <tr><th>Date</th><th>Revenue</th><th>Orders</th></tr>
        </thead>
        <tbody>
          {series.map((day) => (
            <tr key={day.date}>
              <td>{shortDate(day.date)}</td>
              <td>{day.revenueLabel}</td>
              <td>{day.orders}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}
