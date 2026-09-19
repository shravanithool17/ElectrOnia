// components/blueprint.jsx — the drawing-sheet vocabulary.
//
// Small pieces that make the store read as a technical drawing: dimension
// lines, title blocks, the exploded product view, the approval stamp, the
// plotter carriage that crosses the sheet on navigation, and the drafting
// crosshair. Styles live in index.css under "Blueprint components".
import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';

/* ------------------------------------------------------------ useDrawIn */

/**
 * Adds `is-drawn` to the element the first time it scrolls into view, so
 * dimension lines and reveals animate when you reach them rather than all at
 * once on load. Falls back to drawn immediately where IntersectionObserver is
 * missing.
 */
export function useDrawIn({ threshold = 0.25 } = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add('is-drawn');
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add('is-drawn');
            io.unobserve(entry.target);
          }
        }
      },
      { threshold }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold]);
  return ref;
}

/** A block that fades up once when it scrolls into view. */
export function Reveal({ as: Tag = 'div', className = '', children, ...rest }) {
  const ref = useDrawIn({ threshold: 0.12 });
  return (
    <Tag ref={ref} className={`bp-reveal ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/* ------------------------------------------------------------ Dimension */

/**
 * |<—— label ——>|  A dimension line. `drawOn="view"` draws it when it
 * scrolls in; `drawOn="hover"` when a parent `.group` is hovered.
 * `knockout` is the colour behind the label, so the line breaks around it.
 */
export function Dimension({ label, drawOn = 'view', knockout, className = '' }) {
  const ref = useDrawIn();
  return (
    <div
      ref={drawOn === 'view' ? ref : undefined}
      className={`bp-dim ${className}`}
      style={knockout ? { '--bp-dim-knockout': knockout } : undefined}
      aria-hidden="true"
    >
      <span className="bp-dim-line" />
      <span className="bp-dim-label">{label}</span>
    </div>
  );
}

/* ------------------------------------------------------------ TitleBlock */

/**
 * The box in the corner of every engineering drawing. `rows` is a list of
 * [label, value] pairs laid out in a ruled grid.
 */
export function TitleBlock({ rows, className = '' }) {
  return (
    <dl className={`grid grid-cols-2 sm:grid-cols-4 border border-slate-300 text-left ${className}`}>
      {rows.map(([label, value]) => (
        <div key={label} className="border-slate-300 border-r border-b -mr-px -mb-px px-3 py-2 flex flex-col gap-0.5 min-w-0">
          <dt className="label-mono text-slate-400">{label}</dt>
          <dd className="font-mono text-[12px] text-slate-900 truncate">{value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ---------------------------------------------------------- ExplodedView */

/**
 * The product card's image. At rest: the colour render. On hover (fine
 * pointers only): the stage tips into isometric and separates into three
 * sheets — render, linework, construction — with labelled callouts.
 *
 * `line` is the blueprint drawing URL; without one (uploaded photography) a
 * CSS cyanotype of the photo stands in for the line layers.
 */
export function ExplodedView({ render, line, alt, onError, callouts = ['Render', 'Linework', 'Construction'] }) {
  const cyanotype = !line;
  const lineSrc = line ?? render;
  const lineStyle = cyanotype
    ? { filter: 'grayscale(1) contrast(1.6) invert(1) brightness(1.1)', mixBlendMode: 'screen' }
    : undefined;

  return (
    <div className="xv">
      <div className="xv-stage">
        <div className="xv-plate" aria-hidden="true" />
        <img src={lineSrc} alt="" aria-hidden="true" loading="lazy" className="xv-layer is-line l2" style={lineStyle} />
        <img src={lineSrc} alt="" aria-hidden="true" loading="lazy" className="xv-layer is-line l1" style={lineStyle} />
        <img src={render} alt={alt} loading="lazy" onError={onError} className="xv-layer is-render" />
      </div>
      {callouts.map((label, i) => (
        <span key={label} className="xv-callout" aria-hidden="true">
          <span className="text-cyan">{String.fromCharCode(65 + i)}</span> {label}
        </span>
      ))}
    </div>
  );
}

/* ---------------------------------------------------------------- Stamp */

/**
 * Returns [stampElement, fire]. Call fire(text) and a rubber stamp lands on
 * the nearest positioned ancestor, then fades. Re-firing restarts it.
 */
export function useStamp() {
  const [stamp, setStamp] = useState(null);
  const fire = (text = 'Approved') => setStamp({ text, key: Date.now() });
  useEffect(() => {
    if (!stamp) return undefined;
    const id = setTimeout(() => setStamp(null), 1600);
    return () => clearTimeout(id);
  }, [stamp]);
  const element = stamp ? (
    <span key={stamp.key} className="bp-stamp" role="status">
      {stamp.text}
    </span>
  ) : null;
  return [element, fire];
}

/* ------------------------------------------------------- PlotterCarriage */

/** A pen carriage crosses under the nav on every route change. */
export function PlotterCarriage() {
  const location = useLocation();
  return <span key={location.pathname + location.search} className="bp-carriage" aria-hidden="true" />;
}

/* -------------------------------------------------------------- Crosshair */

/**
 * Wrap a region; guide lines follow the pointer across it with a live
 * X/Y readout in millimetres (at 96 dpi), like a drafting table cursor.
 * Hidden for touch and reduced motion.
 */
export function Crosshair({ className = '', children }) {
  const ref = useRef(null);
  const [pos, setPos] = useState(null);

  const onMove = (event) => {
    if (event.pointerType !== 'mouse') return;
    const box = ref.current.getBoundingClientRect();
    setPos({ x: event.clientX - box.left, y: event.clientY - box.top });
  };

  const mm = (px) => ((px * 25.4) / 96).toFixed(1).padStart(5, '0');

  return (
    <div ref={ref} className={`relative ${className}`} onPointerMove={onMove} onPointerLeave={() => setPos(null)}>
      {pos && (
        <>
          <span className="bp-crosshair-x" style={{ top: pos.y }} aria-hidden="true" />
          <span className="bp-crosshair-y" style={{ left: pos.x }} aria-hidden="true" />
          <span
            className="absolute z-[2] pointer-events-none font-mono text-[10px] tracking-wider text-cyan bg-deep/80 px-1.5 py-0.5"
            style={{ top: pos.y + 10, left: pos.x + 12 }}
            aria-hidden="true"
          >
            X {mm(pos.x)} · Y {mm(pos.y)}
          </span>
        </>
      )}
      {children}
    </div>
  );
}

/* ----------------------------------------------------------------- Logo */

/** The mark: an "E" drawn as a plan view, inside registration ticks. */
export function LogoMark({ className = 'w-8 h-8' }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden="true" fill="none">
      <path d="M1 7V1h6M25 1h6v6M31 25v6h-6M7 31H1v-6" stroke="var(--color-cyan)" strokeWidth="1.6" />
      <path d="M10 8h12M10 16h9M10 24h12M10 8v16" stroke="var(--color-ink)" strokeWidth="2.6" strokeLinecap="square" />
      <circle cx="22" cy="16" r="1.6" fill="var(--color-pencil)" />
    </svg>
  );
}
