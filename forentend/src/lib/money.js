// src/lib/money.js — money crosses the wire as integer paise.
//
// The API returns `price` in paise plus a `priceLabel` string. Prefer the
// label when the API gives you one; use formatINR when you have computed an
// amount yourself (a cart subtotal, say).
//
// See docs/adr/0003-money-as-integer-paise.md

const formatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
});

/** 249900 → "₹2,499.00" */
export function formatINR(paise) {
  const value = Number(paise);
  if (!Number.isFinite(value)) return '—';
  return formatter.format(value / 100);
}

/** Rupees typed into a form → integer paise for the API. */
export function toPaise(rupees) {
  const value = Number(rupees);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100);
}

/** Paise → a plain number of rupees, for prefilling an edit form. */
export function toRupees(paise) {
  const value = Number(paise);
  return Number.isFinite(value) ? value / 100 : 0;
}

/** Discount percentage between two paise amounts, or null when there is none. */
export function discountPercent(originalPaise, pricePaise) {
  if (!originalPaise || originalPaise <= pricePaise) return null;
  return Math.round(((originalPaise - pricePaise) / originalPaise) * 100);
}
