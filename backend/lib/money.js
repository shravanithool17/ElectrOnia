// lib/money.js — all money is an integer number of paise.
//
// Why: JavaScript numbers are IEEE-754 doubles, so 0.1 + 0.2 !== 0.3. A
// marketplace multiplies money constantly (line totals, 18% GST, 8%
// commission, partial refunds) and those errors compound until vendor payouts
// no longer reconcile against what customers paid.
//
// ₹2,499.00 is stored as 249900. Formatting happens at the edge — in a DTO or
// in the React component — never in the middle of a calculation.
//
// See docs/adr/0003-money-as-integer-paise.md

export const PAISE_PER_RUPEE = 100;

/** Rupees (from a form, a CSV, a legacy document) → integer paise. */
export function toPaise(rupees) {
  const value = Number(rupees);
  if (!Number.isFinite(value)) {
    throw new TypeError(`toPaise: not a number: ${rupees}`);
  }
  return Math.round(value * PAISE_PER_RUPEE);
}

/** Paise → rupees as a Number. For display only; never for further maths. */
export function toRupees(paise) {
  assertPaise(paise);
  return paise / PAISE_PER_RUPEE;
}

/** 249900 → "₹2,499.00" */
export function formatINR(paise) {
  assertPaise(paise);
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: 2,
  }).format(paise / PAISE_PER_RUPEE);
}

/**
 * unitPrice × qty. Both operands are integers, so the result is exact — this
 * is the whole reason for the paise convention.
 */
export function lineTotal(unitPricePaise, qty) {
  assertPaise(unitPricePaise);
  if (!Number.isInteger(qty) || qty < 0) {
    throw new TypeError(`lineTotal: qty must be a non-negative integer, got ${qty}`);
  }
  return unitPricePaise * qty;
}

/** Sum of any number of paise amounts. */
export function sum(...amounts) {
  return amounts.flat().reduce((total, amount) => {
    assertPaise(amount);
    return total + amount;
  }, 0);
}

/**
 * A percentage of an amount, rounded half-up to the nearest paisa.
 * Rounding happens here, once, rather than wherever a calculation lands.
 */
export function percentOf(paise, pct) {
  assertPaise(paise);
  if (!Number.isFinite(pct) || pct < 0) {
    throw new TypeError(`percentOf: bad percentage: ${pct}`);
  }
  return Math.round((paise * pct) / 100);
}

export function assertPaise(value) {
  if (!Number.isInteger(value)) {
    throw new TypeError(
      `Money must be an integer number of paise, got ${value}. ` +
        'Use toPaise() at the boundary — see docs/adr/0003.'
    );
  }
  if (value < 0) {
    throw new TypeError(`Money cannot be negative: ${value}`);
  }
}
