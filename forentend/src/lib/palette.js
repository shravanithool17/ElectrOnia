// src/lib/palette.js — one colour per category.
//
// The store stays white and calm; colour comes from the products' world:
// each category owns a hue, used for its tile tint, the glow behind a
// product on hover, and small accents. Full class strings (not built from
// parts) so Tailwind can see them.
export const CATEGORY_COLORS = {
  Laptops:     { tint: 'bg-blue-50',    glow: 'rgba(0,113,227,.28)',  text: 'text-blue-600', hoverText: 'group-hover:text-blue-600',    from: '#0071E3', to: '#7C3AED' },
  Smartphones: { tint: 'bg-orange-50',  glow: 'rgba(249,115,22,.28)', text: 'text-orange-600', hoverText: 'group-hover:text-orange-600',  from: '#F97316', to: '#EC4899' },
  Audio:       { tint: 'bg-violet-50',  glow: 'rgba(139,92,246,.30)', text: 'text-violet-600', hoverText: 'group-hover:text-violet-600',  from: '#8B5CF6', to: '#EC4899' },
  Wearables:   { tint: 'bg-emerald-50', glow: 'rgba(16,185,129,.28)', text: 'text-emerald-600', hoverText: 'group-hover:text-emerald-600', from: '#10B981', to: '#06B6D4' },
  Gaming:      { tint: 'bg-pink-50',    glow: 'rgba(236,72,153,.28)', text: 'text-pink-600', hoverText: 'group-hover:text-pink-600',    from: '#EC4899', to: '#F97316' },
  Accessories: { tint: 'bg-amber-50',   glow: 'rgba(245,158,11,.30)', text: 'text-amber-600', hoverText: 'group-hover:text-amber-600',   from: '#F59E0B', to: '#EF4444' },
};

const FALLBACK = { tint: 'bg-slate-50', glow: 'rgba(0,113,227,.22)', text: 'text-blue-600', hoverText: 'group-hover:text-blue-600', from: '#0071E3', to: '#7C3AED' };

export const colorFor = (category) => CATEGORY_COLORS[category] ?? FALLBACK;
