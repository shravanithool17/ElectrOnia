// components/motion.jsx — the small set of motion helpers the storefront uses.
//
// Everything here is progressive: with JavaScript slow to start, or with
// "reduce motion" switched on, content is simply shown (see index.css).
import React, { useEffect, useRef, useState } from 'react';

/** Adds `is-visible` the first time the element scrolls into view. */
export function useInView({ threshold = 0.15, className = 'is-visible' } = {}) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    if (typeof IntersectionObserver === 'undefined') {
      el.classList.add(className);
      return undefined;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add(className);
            io.unobserve(entry.target);
          }
        }
      },
      { threshold, rootMargin: '0px 0px -40px 0px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [threshold, className]);
  return ref;
}

/** Fades and rises into place once, when scrolled to. `delay` in ms. */
export function Reveal({ as: Tag = 'div', delay = 0, className = '', style, children, ...rest }) {
  const ref = useInView();
  return (
    <Tag
      ref={ref}
      className={`reveal ${className}`}
      style={{ ...style, animationDelay: delay ? `${delay}ms` : undefined }}
      {...rest}
    >
      {children}
    </Tag>
  );
}

/**
 * Scroll progress of an element through the viewport, 0 → 1, written to the
 * CSS variable --p on that element (no React re-render per scroll frame).
 * 0 when its top is at the bottom of the screen, 1 when its centre reaches
 * the centre.
 */
export function useScrollProgress() {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;
    let frame = 0;
    const update = () => {
      frame = 0;
      const box = el.getBoundingClientRect();
      const vh = window.innerHeight || 1;
      const start = vh; // top edge entering from below
      const end = vh / 2 - box.height / 2; // centred
      const p = Math.min(1, Math.max(0, (start - box.top) / (start - end || 1)));
      el.style.setProperty('--p', p.toFixed(3));
    };
    const onScroll = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    update();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
  return ref;
}

/** A headline whose words rise in one after another on load. */
export function WordsUp({ text, as: Tag = 'span', className = '', wordClassName = '', start = 0, step = 70 }) {
  return (
    <Tag className={`word-up ${className}`} aria-label={text}>
      {text.split(' ').map((word, i) => (
        // Per word, not on the wrapper: background-clip text does not paint
        // through children that are animating on their own layer.
        <span key={`${word}-${i}`} aria-hidden="true" className={wordClassName} style={{ animationDelay: `${start + i * step}ms` }}>
          {word}
          {' '}
        </span>
      ))}
    </Tag>
  );
}

/**
 * Returns [element, show]. show() pops a small "Added to Bag" pill over the
 * nearest positioned ancestor, then it fades away.
 */
export function useAddedPop() {
  const [pop, setPop] = useState(null);
  useEffect(() => {
    if (!pop) return undefined;
    const id = setTimeout(() => setPop(null), 1700);
    return () => clearTimeout(id);
  }, [pop]);
  const element = pop ? (
    <span key={pop} className="added-pop whitespace-nowrap inline-flex items-center gap-1.5 rounded-full bg-slate-900/90 text-white text-[12px] font-medium px-3.5 py-1.5 backdrop-blur" role="status">
      <svg viewBox="0 0 20 20" className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth="2.4" aria-hidden="true">
        <path d="M4 10.5l4 4 8-9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Added to Bag
    </span>
  ) : null;
  return [element, () => setPop(Date.now())];
}
