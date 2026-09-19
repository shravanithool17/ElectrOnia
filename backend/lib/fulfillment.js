// lib/fulfillment.js — the shipping state machine. Pure: no database, no HTTP.
//
// ONE ORDER, SEVERAL PACKAGES (ADR 0002)
//
// A customer buys headphones from vendor A and a charger from vendor B in one
// checkout. That is one order, but two packages: A and B pack and ship
// separately, from different cities, with different couriers, on different
// days. The order used to have a single `status` that any vendor on it could
// set — so A marking "Delivered" marked B's charger delivered too, before B
// had even packed it.
//
// Now each vendor's share of an order is a FULFILLMENT with its own status,
// carrier and tracking number. The order's status is DERIVED from them and
// never set by hand.
//
//   Pending ──▶ Shipped ──▶ OutForDelivery ──▶ Delivered
//      │                          ▲
//      │           Shipped ───────┘  (out-for-delivery is optional)
//      │           Shipped ──────────────────▶ Delivered
//      ▼
//   Cancelled  (only before it ships — a package already with the courier
//               needs a return, not a cancellation)

export const FULFILLMENT_STATUSES = ['Pending', 'Shipped', 'OutForDelivery', 'Delivered', 'Cancelled'];

/** from → the statuses it may move to. Anything absent is illegal. */
export const TRANSITIONS = {
  Pending: ['Shipped', 'Cancelled'],
  Shipped: ['OutForDelivery', 'Delivered'],
  OutForDelivery: ['Delivered'],
  Delivered: [],
  Cancelled: [],
};

export function canTransition(from, to) {
  return (TRANSITIONS[from] ?? []).includes(to);
}

/** The statuses a package can be in immediately before `to`. Used as a query filter. */
export function sourcesFor(to) {
  return Object.keys(TRANSITIONS).filter((from) => TRANSITIONS[from].includes(to));
}

const IN_TRANSIT = new Set(['Shipped', 'OutForDelivery']);

/**
 * The order's status, from its packages.
 *
 * Cancelled packages are ignored unless every package is cancelled: a customer
 * who cancels the charger but still gets the headphones has an order that was
 * delivered, not one that was cancelled.
 *
 *   all live packages Delivered            → Delivered
 *   all live packages shipped or beyond    → Shipped
 *   some shipped, some not                 → PartiallyShipped
 *   none shipped                           → Processing
 *   every package cancelled                → Cancelled
 *
 * @param {Array<{status: string}>} fulfillments
 * @param {string} current the order's status now — returned unchanged for an
 *   order that is not in the shipping phase (awaiting payment, or legacy data
 *   with no packages)
 */
export function deriveOrderStatus(fulfillments, current) {
  if (current === 'PendingPayment') return current;
  if (!Array.isArray(fulfillments) || fulfillments.length === 0) return current;

  const live = fulfillments.filter((f) => f.status !== 'Cancelled');
  if (live.length === 0) return 'Cancelled';

  const delivered = live.filter((f) => f.status === 'Delivered').length;
  const moving = live.filter((f) => IN_TRANSIT.has(f.status)).length;
  const waiting = live.filter((f) => f.status === 'Pending').length;

  if (delivered === live.length) return 'Delivered';
  if (waiting === 0) return 'Shipped';
  if (delivered + moving > 0) return 'PartiallyShipped';
  return 'Processing';
}

/**
 * Splits an order's lines into one package per vendor.
 *
 * Lines with no vendor (catalogue products seeded without --vendor) are
 * grouped into a package with vendorId null. Only an admin can act on that
 * one — see scripts/backfill-order-vendors.js for attaching them to a vendor.
 */
export function groupIntoFulfillments(items) {
  const byVendor = new Map();

  for (const item of items ?? []) {
    const key = item.companyId ? String(item.companyId) : '';
    if (!byVendor.has(key)) byVendor.set(key, []);
    byVendor.get(key).push(item.productId);
  }

  return [...byVendor.entries()].map(([vendorId, productIds]) => ({
    vendorId: vendorId || null,
    productIds,
    status: 'Pending',
    history: [{ status: 'Pending', at: new Date(), byRole: 'system' }],
  }));
}

/** Customer-facing words for internal status names. */
export const STATUS_LABEL = {
  Pending: 'Being packed',
  Shipped: 'Shipped',
  OutForDelivery: 'Out for delivery',
  Delivered: 'Delivered',
  Cancelled: 'Cancelled',
};
