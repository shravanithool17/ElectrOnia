import { formatINR } from '../../lib/money.js';
import { amountToFreeShipping, FREE_SHIPPING_THRESHOLD } from '../../lib/pricing.js';

/**
 * The cart as the client sees it.
 *
 * `notices` is the interesting part: rather than silently repricing, the cart
 * reports what changed since the customer added an item.
 */
export function toCartDto({ lines, savedLines, totals, couponCode, notices }) {
  const money = (paise) => ({ amount: paise, label: formatINR(paise) });

  return {
    items: lines.map(toLineDto),
    savedForLater: savedLines.map(toLineDto),
    itemCount: lines.reduce((total, line) => total + line.quantity, 0),
    couponCode: couponCode ?? null,
    notices,
    summary: {
      itemsSubtotal: money(totals.itemsSubtotal),
      discountTotal: money(totals.discountTotal),
      taxTotal: money(totals.taxTotal),
      shippingTotal: money(totals.shippingTotal),
      grandTotal: money(totals.grandTotal),
      freeShipping: totals.freeShipping,
      amountToFreeShipping: money(amountToFreeShipping(totals.itemsSubtotal)),
      freeShippingThreshold: money(FREE_SHIPPING_THRESHOLD),
      appliedCoupon: totals.appliedCoupon,
      couponError: totals.couponError,
    },
  };
}

function toLineDto(line) {
  return {
    productId: line.productId,
    title: line.title,
    image: line.image,
    brand: line.brand,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    unitPriceLabel: formatINR(line.unitPrice),
    lineTotal: line.unitPrice * line.quantity,
    lineTotalLabel: formatINR(line.unitPrice * line.quantity),
    available: line.available,
    unavailable: line.unavailable,
    savedForLater: Boolean(line.savedForLater),
    priceChanged: line.priceChanged,
  };
}
