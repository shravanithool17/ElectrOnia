import { formatINR } from '../../lib/money.js';
import { STATUS_LABEL } from '../../lib/fulfillment.js';
import { carrierDisplayName, trackingLinkFor } from '../../lib/carriers.js';

function toItemDto(item) {
  return {
    productId: item.productId,
    title: item.title,
    quantity: item.quantity,
    image: item.image,
    companyId: item.companyId,
    price: item.price,
    priceLabel: formatINR(item.price),
    lineTotal: item.price * item.quantity,
    lineTotalLabel: formatINR(item.price * item.quantity),
  };
}

const PAYMENT_STATUS_LABEL = {
  NotRequired: 'not_required',
  Pending: 'pending',
  Paid: 'paid',
  Failed: 'failed',
  Refunded: 'refunded',
};

/**
 * A package as the customer (and its vendor) sees it: where it is, who is
 * carrying it, how to track it, and which lines are in it.
 */
function toFulfillmentDto(pkg) {
  const link = pkg.carrier ? trackingLinkFor(pkg) : { url: null, kind: null };
  return {
    _id: pkg._id,
    vendorId: pkg.vendorId ?? null,
    productIds: pkg.productIds ?? [],
    status: pkg.status,
    statusLabel: STATUS_LABEL[pkg.status] ?? pkg.status,
    carrier: pkg.carrier ?? null,
    carrierName: pkg.carrier ? carrierDisplayName(pkg.carrier, pkg.carrierName) : null,
    trackingNumber: pkg.trackingNumber ?? null,
    trackingUrl: link.url,
    // 'exact' opens this shipment; 'carrier-site' opens the courier's page,
    // where the number has to be pasted — the UI says which.
    trackingLinkKind: link.kind,
    shippedAt: pkg.shippedAt ?? null,
    outForDeliveryAt: pkg.outForDeliveryAt ?? null,
    deliveredAt: pkg.deliveredAt ?? null,
    cancelledAt: pkg.cancelledAt ?? null,
    cancelReason: pkg.cancelReason ?? null,
    history: pkg.history ?? [],
  };
}

export function toOrderDto(order) {
  if (!order) return null;
  return {
    _id: order._id,
    customerName: order.customerName,
    customerEmail: order.customerEmail,
    items: (order.items ?? []).map(toItemDto),
    totalAmount: order.totalAmount,
    totalAmountLabel: formatINR(order.totalAmount),
    shippingAddress: order.shippingAddress,
    paymentMethod: order.paymentMethod,
    // Kept from an earlier edit that read `order.paymentStatus` — a field the
    // schema does not have, so it said 'pending' for every order, paid or
    // cash on delivery. Now derived from the real payment state.
    paymentStatus: PAYMENT_STATUS_LABEL[order.payment?.status] ?? 'not_required',
    status: order.status,
    // Just enough for the orders page to say "Awaiting payment" or flag a
    // refund; the provider ids stay server-side.
    payment: {
      status: order.payment?.status ?? 'NotRequired',
      paidAt: order.payment?.paidAt ?? null,
      needsRefund: Boolean(order.payment?.needsRefund),
    },
    statusHistory: order.statusHistory ?? [],
    fulfillments: (order.fulfillments ?? []).map(toFulfillmentDto),
    // What the customer may still do. Computed here so every screen agrees.
    canCancel:
      ['Processing', 'Pending'].includes(order.status) &&
      (order.fulfillments ?? []).every((f) => f.status === 'Pending'),
    createdAt: order.createdAt,
  };
}

export const toOrderDtos = (orders) => orders.map(toOrderDto);

/**
 * The same order, cut down to what `user` is allowed to see.
 *
 * A vendor sees only their own lines and their own package — not what the
 * customer bought from anyone else, and not another vendor's courier or
 * tracking number. They do see the shipping address and name, because they
 * have to ship it.
 */
export function toOrderDtoFor(order, user) {
  if (!order || user?.role !== 'vendor') return toOrderDto(order);

  const mine = (id) => id && String(id) === String(user.id);
  const dto = toOrderDto({
    ...order,
    items: (order.items ?? []).filter((item) => mine(item.companyId)),
    fulfillments: (order.fulfillments ?? []).filter((pkg) => mine(pkg.vendorId)),
  });

  // Totals and the customer's email describe the whole order, including
  // other vendors' goods; the vendor's share is the sum of their lines.
  const share = dto.items.reduce((total, item) => total + item.lineTotal, 0);
  dto.totalAmount = share;
  dto.totalAmountLabel = formatINR(share);
  delete dto.customerEmail;
  delete dto.canCancel;
  return dto;
}
