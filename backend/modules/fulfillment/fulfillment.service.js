// modules/fulfillment/fulfillment.service.js — shipping and delivery.
//
// WHO CAN DO WHAT
//
//   vendor    ships, marks out-for-delivery, marks delivered, or cancels
//             THEIR package in an order — never another vendor's
//   admin     the same, on any package (addressed by fulfillmentId)
//   customer  cancels the whole order, but only while nothing has shipped
//
// HOW A TRANSITION IS MADE SAFE
//
// Every transition is ONE conditional update whose filter includes the
// package's current status. Two clicks on "Mark shipped", or a vendor and an
// admin acting at once, race on the database and exactly one matches — the
// other gets a clear 409 instead of a second "shipped" email and a history
// with the same event twice.
//
// HOW THE ORDER STATUS STAYS RIGHT
//
// The order's status is derived from its packages (lib/fulfillment.js). After
// each transition it is recomputed from a fresh read and written only if
// `fulfillmentVersion` has not moved since that read. If two vendors ship at
// the same instant, the recompute that read the older state loses the
// condition and does nothing; the later one saw both and writes the right
// answer. Whatever the interleaving, the last recompute to run saw everything.
import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { ROLES } from '../../middleware/auth.js';
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { sendInBackground, templates } from '../../lib/mailer.js';
import {
  canTransition,
  deriveOrderStatus,
  groupIntoFulfillments,
  sourcesFor,
} from '../../lib/fulfillment.js';
import { carrierDisplayName, trackingLinkFor } from '../../lib/carriers.js';
import Order from '../../model/order.model.js';
import Product from '../../model/product.model.js';
import { productRepo } from '../catalog/product.repo.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Orders a package may move in. Awaiting payment and cancelled are excluded. */
const SHIPPABLE_ORDER = { status: { $in: ['Processing', 'PartiallyShipped', 'Shipped', 'Delivered'] } };

// --------------------------------------------------------------- helpers

/**
 * Orders created before packages existed have none. Build them from the
 * lines — using the product's CURRENT vendor for lines that were bought with
 * no vendor recorded — and store them, once.
 *
 * The write is conditional on the order still having no packages, so two
 * requests backfilling the same order at once cannot both append a set.
 */
async function ensureFulfillments(order) {
  if (order.fulfillments?.length) return order;

  const missing = order.items.filter((item) => !item.companyId).map((item) => item.productId);
  const owners = missing.length
    ? new Map(
        (await Product.find({ _id: { $in: missing } }, { companyId: 1 }).lean()).map((p) => [
          String(p._id),
          p.companyId ?? null,
        ])
      )
    : new Map();

  const items = order.items.map((item) => ({
    productId: item.productId,
    companyId: item.companyId ?? owners.get(String(item.productId)) ?? null,
  }));

  const fulfillments = groupIntoFulfillments(items);
  const vendorIds = fulfillments.map((f) => f.vendorId).filter(Boolean);

  const updated = await Order.findOneAndUpdate(
    { _id: order._id, $or: [{ fulfillments: { $exists: false } }, { fulfillments: { $size: 0 } }] },
    {
      $set: { fulfillments },
      ...(vendorIds.length ? { $addToSet: { vendorIds: { $each: vendorIds } } } : {}),
    },
    { new: true }
  );

  // Someone else backfilled it between the read and the write — use theirs.
  return updated ?? Order.findById(order._id);
}

/**
 * Which package in this order the caller may act on.
 *
 * A vendor's scope is their own package, full stop — a fulfillmentId naming
 * somebody else's is ignored, not honoured. An admin names one explicitly, or
 * gets the only one if there is just one.
 */
function pickFulfillment(order, user, fulfillmentId) {
  const packages = order.fulfillments ?? [];

  if (user.role === ROLES.VENDOR) {
    return packages.find((f) => f.vendorId && String(f.vendorId) === String(user.id)) ?? null;
  }

  if (user.role === ROLES.ADMIN) {
    if (fulfillmentId) return packages.find((f) => String(f._id) === String(fulfillmentId)) ?? null;
    return packages.length === 1 ? packages[0] : null;
  }

  return null;
}

/** Loads an order the caller may act on, with packages guaranteed to exist. */
async function loadForActor(orderId, user) {
  const scope =
    user.role === ROLES.ADMIN
      ? { _id: orderId }
      : { _id: orderId, vendorIds: oid(user.id) };

  const order = await Order.findOne({ ...scope, ...SHIPPABLE_ORDER });
  // Not found, not theirs, unpaid, or cancelled all read the same from
  // outside: 404, so the response cannot be used to probe other orders.
  if (!order) throw new NotFoundError('Order not found');
  return ensureFulfillments(order);
}

/**
 * Moves one package from any legal source status to `to`, atomically.
 * Returns the order AFTER the change, or throws a 409 explaining why not.
 */
async function transition(order, pkg, to, { set = {}, byRole, note }) {
  const from = pkg.status;
  if (!canTransition(from, to)) {
    throw new ConflictError(
      'ILLEGAL_TRANSITION',
      transitionMessage(from, to),
      { from, to }
    );
  }

  const at = new Date();
  const prefixed = Object.fromEntries(
    Object.entries(set).map(([key, value]) => [`fulfillments.$.${key}`, value])
  );

  const updated = await Order.findOneAndUpdate(
    {
      _id: order._id,
      ...SHIPPABLE_ORDER,
      // The package, AND that it is still in a status this move can start
      // from. This condition is what turns a double click into one shipment.
      fulfillments: { $elemMatch: { _id: pkg._id, status: { $in: sourcesFor(to) } } },
    },
    {
      $set: { 'fulfillments.$.status': to, ...prefixed },
      $push: { 'fulfillments.$.history': { status: to, at, byRole, note } },
      $inc: { fulfillmentVersion: 1 },
    },
    { new: true }
  );

  if (!updated) {
    throw new ConflictError(
      'ALREADY_UPDATED',
      'This package was updated by someone else a moment ago. Refresh to see its current status.'
    );
  }

  await recomputeOrderStatus(updated._id);
  return Order.findById(updated._id);
}

function transitionMessage(from, to) {
  if (from === to) return `This package is already ${to === 'OutForDelivery' ? 'out for delivery' : to.toLowerCase()}.`;
  // Terminal states first, so "delivered → cancelled" says it was delivered
  // rather than that it shipped.
  if (from === 'Cancelled') return 'This package was cancelled.';
  if (from === 'Delivered') return 'This package has already been delivered.';
  if (to === 'Cancelled') return 'This package has already shipped, so it can no longer be cancelled.';
  if (from === 'Pending') return 'Mark this package as shipped first.';
  return `A package cannot go from ${from} to ${to}.`;
}

/**
 * Writes the derived order status. Safe to call at any time and from any
 * number of places at once — see the file header.
 */
export async function recomputeOrderStatus(orderId) {
  const order = await Order.findById(orderId, {
    status: 1,
    fulfillments: 1,
    fulfillmentVersion: 1,
    paymentMethod: 1,
    payment: 1,
  }).lean();
  if (!order) return null;

  const next = deriveOrderStatus(order.fulfillments, order.status);
  const cashNowCollected =
    next === 'Delivered' &&
    order.paymentMethod === 'COD' &&
    order.payment?.status !== 'Paid';

  if (next === order.status && !cashNowCollected) return next;

  const set = { status: next };
  // Cash on delivery is paid when the last package is handed over — this is
  // the only point the system learns the money arrived.
  if (cashNowCollected) {
    set['payment.status'] = 'Paid';
    set['payment.paidAt'] = new Date();
  }

  await Order.updateOne(
    { _id: orderId, fulfillmentVersion: order.fulfillmentVersion },
    {
      $set: set,
      ...(next !== order.status
        ? { $push: { statusHistory: { status: next, at: new Date(), byRole: 'system' } } }
        : {}),
    }
  );
  return next;
}

// ------------------------------------------------------------ side effects

function shipmentSummary(pkg) {
  const link = trackingLinkFor(pkg);
  return {
    carrierName: carrierDisplayName(pkg.carrier, pkg.carrierName),
    trackingNumber: pkg.trackingNumber,
    trackingUrl: link.url,
    trackingLinkKind: link.kind,
  };
}

function itemsIn(order, pkg) {
  const ids = new Set((pkg.productIds ?? []).map(String));
  return order.items.filter((item) => ids.has(String(item.productId)));
}

function notify(order, pkg, kind) {
  const items = itemsIn(order, pkg).map((item) => ({ title: item.title, quantity: item.quantity }));
  const template = {
    shipped: templates.orderShipped,
    delivered: templates.orderDelivered,
    cancelled: templates.packageCancelled,
  }[kind];

  sendInBackground(
    {
      to: order.customerEmail,
      ...template({
        name: order.customerName,
        orderId: order._id,
        items,
        ...shipmentSummary(pkg),
        reason: pkg.cancelReason,
        refundDue: kind === 'cancelled' && order.payment?.status === 'Paid',
        appUrl: env.appUrl,
      }),
    },
    { orderId: String(order._id), kind: `package-${kind}` }
  );
}

async function releasePackageStock(order, pkg) {
  await Promise.all(
    itemsIn(order, pkg).map((item) => productRepo.releaseStock(item.productId, item.quantity))
  );
}

// ------------------------------------------------------------------ public

export const fulfillmentService = {
  async ship(user, orderId, { carrier, carrierName, trackingNumber, trackingUrl, fulfillmentId }) {
    const order = await loadForActor(orderId, user);
    const pkg = pickFulfillment(order, user, fulfillmentId);
    if (!pkg) throw noPackage(user);

    const after = await transition(order, pkg, 'Shipped', {
      byRole: user.role,
      note: `Handed to ${carrierDisplayName(carrier, carrierName)}${trackingNumber ? ` · ${trackingNumber}` : ''}`,
      set: {
        carrier,
        carrierName: carrier === 'other' ? carrierName : null,
        trackingNumber: trackingNumber ?? null,
        trackingUrl: trackingUrl ?? null,
        shippedAt: new Date(),
      },
    });

    notify(after, after.fulfillments.id(pkg._id), 'shipped');
    return after;
  },

  async outForDelivery(user, orderId, { fulfillmentId } = {}) {
    const order = await loadForActor(orderId, user);
    const pkg = pickFulfillment(order, user, fulfillmentId);
    if (!pkg) throw noPackage(user);

    // No email: the courier already sends one for this step, and a second
    // from us adds nothing.
    return transition(order, pkg, 'OutForDelivery', {
      byRole: user.role,
      set: { outForDeliveryAt: new Date() },
    });
  },

  async deliver(user, orderId, { fulfillmentId } = {}) {
    const order = await loadForActor(orderId, user);
    const pkg = pickFulfillment(order, user, fulfillmentId);
    if (!pkg) throw noPackage(user);

    const after = await transition(order, pkg, 'Delivered', {
      byRole: user.role,
      set: { deliveredAt: new Date() },
    });

    notify(after, after.fulfillments.id(pkg._id), 'delivered');
    return after;
  },

  /** A vendor cancelling their own package — out of stock, damaged, cannot fulfil. */
  async cancelPackage(user, orderId, { reason, fulfillmentId }) {
    const order = await loadForActor(orderId, user);
    const pkg = pickFulfillment(order, user, fulfillmentId);
    if (!pkg) throw noPackage(user);

    const after = await transition(order, pkg, 'Cancelled', {
      byRole: user.role,
      note: reason,
      set: { cancelledAt: new Date(), cancelReason: reason },
    });

    const cancelled = after.fulfillments.id(pkg._id);
    await releasePackageStock(after, cancelled);
    await flagRefundIfPaid(after, `Package cancelled by ${user.role}: ${reason}`);
    notify(after, cancelled, 'cancelled');
    return after;
  },

  /**
   * The customer cancels the whole order. Allowed only while every package is
   * still being packed — once anything is with a courier, it is a return.
   */
  async cancelByCustomer(user, orderId, { reason }) {
    const order = await Order.findOne({
      _id: orderId,
      customerId: oid(user.id),
      status: { $in: ['Processing', 'Pending'] },
    });
    if (!order) {
      const exists = await Order.exists({ _id: orderId, customerId: oid(user.id) });
      if (!exists) throw new NotFoundError('Order not found');
      throw new ConflictError(
        'CANNOT_CANCEL',
        'Part of this order has already shipped, so it can no longer be cancelled.'
      );
    }

    const withPackages = await ensureFulfillments(order);
    const note = reason ? `Cancelled by customer: ${reason}` : 'Cancelled by customer';

    // Every package in one conditional update: all must still be Pending.
    // If a vendor ships one in the gap between the read above and this write,
    // the condition fails and nothing is cancelled — never half an order.
    const at = new Date();
    const cancelled = await Order.findOneAndUpdate(
      {
        _id: order._id,
        status: { $in: ['Processing', 'Pending'] },
        fulfillments: { $not: { $elemMatch: { status: { $ne: 'Pending' } } } },
      },
      {
        $set: {
          'fulfillments.$[].status': 'Cancelled',
          'fulfillments.$[].cancelledAt': at,
          'fulfillments.$[].cancelReason': note,
        },
        $push: { 'fulfillments.$[].history': { status: 'Cancelled', at, byRole: 'customer', note } },
        $inc: { fulfillmentVersion: 1 },
      },
      { new: true }
    );

    if (!cancelled) {
      throw new ConflictError(
        'CANNOT_CANCEL',
        'Part of this order shipped a moment ago, so it can no longer be cancelled.'
      );
    }

    await Promise.all(
      withPackages.items.map((item) => productRepo.releaseStock(item.productId, item.quantity))
    );
    await recomputeOrderStatus(cancelled._id);
    const after = await Order.findById(cancelled._id);
    await flagRefundIfPaid(after, note);

    for (const pkg of after.fulfillments) notify(after, pkg, 'cancelled');
    return after;
  },

  ensureFulfillments,
};

/**
 * Money already taken for something that will not be delivered has to go
 * back. Refunds are not automated yet, so the order is flagged for whoever
 * processes them — the same flag the late-payment path uses.
 */
async function flagRefundIfPaid(order, note) {
  if (order.paymentMethod === 'COD' || order.payment?.status !== 'Paid') return;

  await Order.updateOne({ _id: order._id }, { $set: { 'payment.needsRefund': true } });
  logger.warn(
    { orderId: String(order._id), note },
    'Paid order (or part of one) cancelled — refund required'
  );
}

function noPackage(user) {
  if (user.role === ROLES.ADMIN) {
    return new ValidationError(
      'This order has more than one package. Say which one with fulfillmentId.'
    );
  }
  // A vendor with no package in this order: same 404 as an order that is not theirs.
  return new NotFoundError('Order not found');
}

