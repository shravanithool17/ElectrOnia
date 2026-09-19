// components/ui.jsx — the shared primitives.
//
// Every surface in the app was hand-rolling its own button classes, which is
// why nothing looked like the same product twice. These are the only styled
// building blocks; screens compose them and never restate a colour.
import React from 'react';

/* ------------------------------------------------------------------ Button */

// Flat fills, hairline outlines, no drop shadows — the instrument-panel
// language. A button reads as pressed by darkening, not by lifting.
const BUTTON_VARIANTS = {
  // Pill buttons. Primary is the one blue; secondary is a soft grey fill;
  // "link" is blue text with a chevron feel, for the quieter second action.
  primary: 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800',
  secondary: 'bg-slate-100 text-slate-900 hover:bg-slate-200',
  outline: 'bg-transparent text-blue-600 border border-blue-600 hover:bg-blue-600 hover:text-white',
  ghost: 'text-slate-600 hover:text-slate-900 hover:bg-slate-100',
  link: 'text-blue-600 hover:underline underline-offset-4 !px-1',
  signal: 'bg-signal-500 text-white hover:bg-signal-600',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  inverse: 'bg-white text-slate-900 hover:bg-slate-100',
};

const BUTTON_SIZES = {
  sm: 'text-[13px] px-3.5 py-1.5 gap-1.5',
  md: 'text-[14px] px-5 py-2 gap-2',
  lg: 'text-[16px] px-7 py-3 gap-2',
};

export function Button({
  as: Tag = 'button',
  variant = 'primary',
  size = 'md',
  full = false,
  loading = false,
  disabled = false,
  className = '',
  children,
  ...rest
}) {
  return (
    <Tag
      disabled={Tag === 'button' ? disabled || loading : undefined}
      className={[
        'inline-flex items-center justify-center rounded-full font-medium tracking-[-0.01em]',
        'transition-colors duration-150',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        full ? 'w-full' : '',
        className,
      ].join(' ')}
      {...rest}
    >
      {loading && <Spinner className="w-3.5 h-3.5" />}
      {children}
    </Tag>
  );
}

/* ----------------------------------------------------------------- Spinner */

export function Spinner({ className = 'w-4 h-4' }) {
  return (
    <svg className={`animate-spin ${className}`} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-90"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z"
      />
    </svg>
  );
}

/* ------------------------------------------------------------------- Badge */

const BADGE_TONES = {
  neutral: 'bg-slate-100 text-slate-600 border-transparent',
  blue: 'bg-blue-50 text-blue-700 border-transparent',
  green: 'bg-emerald-50 text-emerald-700 border-transparent',
  amber: 'bg-amber-50 text-amber-800 border-transparent',
  red: 'bg-red-50 text-red-700 border-transparent',
  signal: 'bg-signal-50 text-signal-600 border-transparent',
  ink: 'bg-slate-900 text-white border-slate-900',
};

export function Badge({ tone = 'neutral', className = '', children }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

/**
 * Stock is the one thing a shopper checks before anything else, so it gets its
 * own component and reads as words, not a raw number.
 */
export function StockBadge({ stock }) {
  if (stock <= 0) return <Badge tone="red">Sold out</Badge>;
  if (stock <= 5) return <Badge tone="signal">{stock} left</Badge>;
  return <Badge tone="green">In stock</Badge>;
}

/* -------------------------------------------------------------------- Card */

export function Card({ className = '', children, ...rest }) {
  return (
    <div
      className={`bg-white border border-slate-200/70 rounded-2xl ${className}`}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- Skeleton */

/**
 * A grey block the same shape as the content that will replace it. Layout
 * does not shift when data lands, which is most of why a page feels fast.
 */
export function Skeleton({ className = '' }) {
  return <div className={`animate-pulse bg-slate-200/70 rounded-sm ${className}`} />;
}

export function ProductCardSkeleton() {
  return (
    <Card className="overflow-hidden">
      <Skeleton className="aspect-[4/3] rounded-none" />
      <div className="p-4 flex flex-col gap-2">
        <Skeleton className="h-3 w-1/3" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-4 w-2/3" />
        <div className="flex items-center justify-between pt-2">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-8 w-8 rounded-lg" />
        </div>
      </div>
    </Card>
  );
}

export function SkeletonGrid({ count = 8 }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/* ------------------------------------------------------------ MicroLabel */

/**
 * The uppercase mono eyebrow. Used for section labels, table headers and
 * stat-tile captions — the single most recognisable element of the direction.
 */
export function MicroLabel({ as: Tag = 'span', className = '', children }) {
  return <Tag className={`label-mono text-signal-600 ${className}`}>{children}</Tag>;
}

/**
 * A section heading with an optional eyebrow and trailing action, so every
 * screen gets the same rhythm without restating it.
 */
export function SectionHeading({ eyebrow, title, subtitle, action }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div className="flex flex-col gap-1">
        {eyebrow && <MicroLabel>{eyebrow}</MicroLabel>}
        <h2 className="text-3xl sm:text-[40px] font-bold text-slate-900 leading-[1.08]">{title}</h2>
        {subtitle && <p className="text-[17px] text-slate-500">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ------------------------------------------------------------- EmptyState */

/**
 * An empty result used to render as a blank page, which reads as broken. An
 * empty state says what happened and offers the way out.
 */
export function EmptyState({ icon = '🔍', title, message, action }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="text-4xl mb-3" aria-hidden="true">{icon}</div>
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {message && <p className="mt-1 text-sm text-slate-500 max-w-sm">{message}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }) {
  return (
    <EmptyState
      icon="⚠️"
      title="Something went wrong"
      message={message || 'We could not load this. The API may be offline.'}
      action={onRetry ? <Button onClick={onRetry} variant="secondary">Try again</Button> : null}
    />
  );
}

/* ----------------------------------------------------------------- Rating */

export function Rating({ value = 0, count, size = 'sm' }) {
  const filled = Math.round(value);
  return (
    <div className="flex items-center gap-1">
      <div className={`flex ${size === 'sm' ? 'text-xs' : 'text-sm'} text-amber-500`} aria-hidden="true">
        {[1, 2, 3, 4, 5].map((star) => (
          <span key={star} className={star <= filled ? '' : 'text-slate-300'}>★</span>
        ))}
      </div>
      <span className="text-[12px] text-slate-500">
        {value?.toFixed?.(1) ?? value}
        {count != null && ` (${count})`}
      </span>
    </div>
  );
}

/* ------------------------------------------------------------ QuantityStepper */

export function QuantityStepper({ value, onChange, max = 20, min = 1 }) {
  const clamp = (n) => Math.min(max, Math.max(min, n));
  return (
    <div className="inline-flex items-center border border-slate-300 rounded-full overflow-hidden bg-white">
      <button
        type="button"
        onClick={() => onChange(clamp(value - 1))}
        disabled={value <= min}
        aria-label="Decrease quantity"
        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        −
      </button>
      <span className="px-4 py-1.5 text-sm font-medium text-slate-900 tabular-nums min-w-[3ch] text-center">
        {value}
      </span>
      <button
        type="button"
        onClick={() => onChange(clamp(value + 1))}
        disabled={value >= max}
        aria-label="Increase quantity"
        className="px-3 py-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent"
      >
        +
      </button>
    </div>
  );
}

/* -------------------------------------------------------------- Breadcrumb */

export function Breadcrumb({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-[12px] text-slate-500 flex-wrap">
      {items.map((item, i) => (
        <React.Fragment key={item.label}>
          {i > 0 && <span aria-hidden="true" className="text-slate-300">›</span>}
          {item.to ? (
            <a href={item.to} className="hover:text-slate-900">{item.label}</a>
          ) : (
            <span className="text-slate-900">{item.label}</span>
          )}
        </React.Fragment>
      ))}
    </nav>
  );
}

/* -------------------------------------------------------------- Pagination */

export function Pagination({ page, totalPages, onChange }) {
  if (totalPages <= 1) return null;

  // A window around the current page, so 40 pages do not render 40 buttons.
  const window = 2;
  const pages = [];
  for (let p = 1; p <= totalPages; p += 1) {
    const near = Math.abs(p - page) <= window;
    if (p === 1 || p === totalPages || near) pages.push(p);
    else if (pages.at(-1) !== '…') pages.push('…');
  }

  return (
    <nav className="flex items-center justify-center gap-1.5 mt-8" aria-label="Pagination">
      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
      >
        Previous
      </Button>

      {pages.map((p, i) =>
        p === '…' ? (
          <span key={`gap-${i}`} className="px-2 text-slate-400 text-sm">…</span>
        ) : (
          <button
            key={p}
            onClick={() => onChange(p)}
            aria-current={p === page ? 'page' : undefined}
            className={[
              'min-w-[2.25rem] h-9 rounded-full text-[13px] font-medium tabular-nums transition-colors',
              p === page
                ? 'bg-slate-900 text-white'
                : 'bg-white text-slate-700 border border-slate-300 hover:border-slate-900',
            ].join(' ')}
          >
            {p}
          </button>
        )
      )}

      <Button
        variant="secondary"
        size="sm"
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
      >
        Next
      </Button>
    </nav>
  );
}
