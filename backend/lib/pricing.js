// lib/pricing.js — every rupee decision in one place.
//
// Pure functions of their arguments: no database, no request. That is what
// lets the cart, the checkout quote and the place-order transaction all price
// identically. When the cart total and the checkout total disagree, it is
// always because two code paths were doing the arithmetic — so there is only
// one here.
//
// All amounts are integer paise (docs/adr/0003).
import { percentOf, assertPaise } from './money.js';

/** Default GST rate for consumer electronics. */
export const DEFAULT_TAX_RATE_PCT = 18;

/** Free delivery above this order value, otherwise a flat fee. */
export const FREE_SHIPPING_THRESHOLD = 500000; // ₹5,000.00
export const FLAT_SHIPPING_FEE = 9900; // ₹99.00

/**
 * @param {Array<{unitPrice:number, quantity:number, taxRatePct?:number}>} lines
 * @param {{code:string,type:string,value:number,maxDiscount?:number,minOrderValue?:number}|null} coupon
 */
export function priceOrder(lines, coupon = null) {
  const items = lines.map((line) => {
    assertPaise(line.unitPrice);
    return {
      ...line,
      lineTotal: line.unitPrice * line.quantity,
      taxRatePct: line.taxRatePct ?? DEFAULT_TAX_RATE_PCT,
    };
  });

  const itemsSubtotal = items.reduce((total, line) => total + line.lineTotal, 0);

  const { discountTotal, freeShipping, couponError } = applyCoupon(coupon, itemsSubtotal);

  // Shipping is decided on the pre-discount subtotal, so a coupon cannot
  // accidentally push an order below the free-delivery threshold.
  const shippingTotal = freeShipping || itemsSubtotal >= FREE_SHIPPING_THRESHOLD
    ? 0
    : itemsSubtotal > 0
      ? FLAT_SHIPPING_FEE
      : 0;

  // GST applies to the discounted taxable value. The discount is spread across
  // lines in proportion to their value, so a cart mixing 18% and 28% items is
  // taxed correctly rather than at a blended guess.
  //
  // Simplification, stated deliberately: GST on the shipping fee is not
  // modelled. A real invoice charges it at the rate of the goods shipped.
  const taxTotal = items.reduce((total, line) => {
    const share = itemsSubtotal > 0 ? line.lineTotal / itemsSubtotal : 0;
    const lineDiscount = Math.round(discountTotal * share);
    const taxable = Math.max(0, line.lineTotal - lineDiscount);
    return total + percentOf(taxable, line.taxRatePct);
  }, 0);

  const grandTotal = itemsSubtotal - discountTotal + taxTotal + shippingTotal;

  return {
    itemsSubtotal,
    discountTotal,
    shippingTotal,
    taxTotal,
    grandTotal,
    freeShipping: shippingTotal === 0 && itemsSubtotal > 0,
    couponError,
    appliedCoupon: discountTotal > 0 || freeShipping ? coupon?.code ?? null : null,
  };
}

/**
 * Coupon rules. Returns a reason string rather than throwing, so the cart can
 * show "this coupon needs ₹2,000" instead of failing the whole request.
 */
function applyCoupon(coupon, subtotal) {
  const none = { discountTotal: 0, freeShipping: false, couponError: null };

  if (!coupon) return none;

  if (coupon.minOrderValue && subtotal < coupon.minOrderValue) {
    return { ...none, couponError: 'MIN_ORDER_NOT_MET' };
  }

  if (coupon.type === 'free_shipping') {
    return { discountTotal: 0, freeShipping: true, couponError: null };
  }

  if (coupon.type === 'percent') {
    const raw = percentOf(subtotal, coupon.value);
    // A percentage coupon without a cap is how a marketplace loses money on
    // one large order.
    const capped = coupon.maxDiscount ? Math.min(raw, coupon.maxDiscount) : raw;
    return { discountTotal: Math.min(capped, subtotal), freeShipping: false, couponError: null };
  }

  if (coupon.type === 'fixed') {
    // Never discount below zero — a "free" order would still be a valid total.
    return { discountTotal: Math.min(coupon.value, subtotal), freeShipping: false, couponError: null };
  }

  return { ...none, couponError: 'UNKNOWN_COUPON_TYPE' };
}

/** How much more the customer needs to spend for free delivery. */
export function amountToFreeShipping(itemsSubtotal) {
  return Math.max(0, FREE_SHIPPING_THRESHOLD - itemsSubtotal);
}
