// modules/payments/payment.service.js
//
// THE MODEL
//
//   1. Checkout creates an order in PendingPayment and reserves its stock.
//   2. This module creates a matching Razorpay order and hands the browser
//      what Checkout needs. No secret leaves the server.
//   3. The customer pays. TWO things then race to tell us:
//        - the browser callback (fast, but the browser can close, lie, or be
//          replayed)
//        - the webhook (slower, retried until acknowledged, authoritative)
//      Both funnel into the SAME `markPaid`, which is idempotent, so whichever
//      arrives first wins and the second is a no-op.
//   4. Only when payment is confirmed: the order moves to Processing, the
//      coupon is redeemed, and the purchased items leave the cart. Until then
//      the cart is untouched, so cancelling the Razorpay window leaves the
//      customer exactly where they were.
//   5. If nobody pays, the order stays in PendingPayment and its stock stays
//      reserved until `expireStale()` releases it — or until the same customer
//      starts another checkout, which supersedes it.
//
// WHY THE BROWSER CALLBACK IS NOT ENOUGH ON ITS OWN: a valid signature proves
// the ids were not tampered with. It does NOT prove the amount charged equals
// the amount owed — so the amount is read back from Razorpay and compared
// against the order before anything is marked paid.
import mongoose from 'mongoose';

import { env } from '../../config/env.js';
import { logger } from '../../config/logger.js';
import { formatINR } from '../../lib/money.js';
import { sendInBackground, templates } from '../../lib/mailer.js';
import { BadRequestError, ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import {
  createProviderOrder,
  fetchPayment,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  checkoutOptions,
  HANDLED_EVENTS,
} from '../../lib/razorpay.js';
import Order from '../../model/order.model.js';
import Payment from '../../model/payment.model.js';
import WebhookEvent from '../../model/webhookEvent.model.js';
import { productRepo } from '../catalog/product.repo.js';
import { cartRepo } from '../cart/cart.repo.js';
import { couponService } from '../checkout/coupon.service.js';

/** How long an unpaid order holds its stock. */
const PAYMENT_WINDOW_MS = 30 * 60 * 1000;

export const paymentService = {
  /**
   * Opens a payment attempt for an order the caller owns.
   *
   * Ownership is enforced in the FILTER, not with an if-statement after the
   * read: another customer's order simply does not match, and returns 404
   * rather than confirming it exists.
   */
  async createIntent(user, orderId) {
    if (!env.razorpay.enabled) {
      throw new ValidationError('Online payment is not configured on this server.');
    }

    const order = await Order.findOne({ _id: orderId, customerId: user.id });
    if (!order) throw new NotFoundError('That order does not exist.');

    if (order.payment?.status === 'Paid') {
      throw new ConflictError('ALREADY_PAID', 'This order has already been paid for.');
    }
    if (order.status === 'Cancelled') {
      throw new ConflictError('ORDER_CANCELLED', 'This order was cancelled.');
    }

    const providerOrder = await createProviderOrder({
      amountPaise: order.amounts?.grandTotal ?? order.totalAmount,
      orderId: order._id,
    });

    await Payment.create({
      orderId: order._id,
      customerId: user.id,
      providerOrderId: providerOrder.id,
      amount: providerOrder.amount,
      currency: providerOrder.currency,
      status: 'Created',
    });

    order.payment = {
      ...(order.payment ?? {}),
      status: 'Pending',
      provider: 'razorpay',
      providerOrderId: providerOrder.id,
    };
    await order.save();

    return {
      orderId: String(order._id),
      checkout: checkoutOptions({ providerOrder, order, customer: user }),
    };
  },

  /**
   * The browser callback. Convenience only — the webhook would get here
   * eventually — but it lets the success screen appear immediately.
   */
  async confirmFromCallback(user, { razorpayOrderId, razorpayPaymentId, signature }) {
    const valid = verifyCheckoutSignature({
      orderId: razorpayOrderId,
      paymentId: razorpayPaymentId,
      signature,
    });

    if (!valid) {
      logger.warn(
        { razorpayOrderId, userId: user.id },
        'Rejected a payment callback with an invalid signature'
      );
      throw new BadRequestError(
        'INVALID_SIGNATURE',
        'That payment could not be verified. If money was debited it will be confirmed automatically, or refunded.'
      );
    }

    const payment = await Payment.findOne({
      providerOrderId: razorpayOrderId,
      customerId: user.id,
    });
    if (!payment) throw new NotFoundError('No payment attempt matches that order.');

    // The signature proves the ids are ours and untampered. It says nothing
    // about the amount, so the amount is read back from the provider.
    const providerPayment = await fetchPayment(razorpayPaymentId);

    if (providerPayment.amount !== payment.amount) {
      logger.error(
        { expected: payment.amount, actual: providerPayment.amount, razorpayPaymentId },
        'Payment amount does not match the order — not marking as paid'
      );
      throw new ConflictError(
        'AMOUNT_MISMATCH',
        'The amount paid does not match this order. Support has been notified.'
      );
    }

    if (!['captured', 'authorized'].includes(providerPayment.status)) {
      throw new ConflictError(
        'PAYMENT_NOT_COMPLETE',
        `Razorpay reports this payment as "${providerPayment.status}".`
      );
    }

    return markPaid({
      payment,
      providerPaymentId: razorpayPaymentId,
      method: providerPayment.method,
      confirmedBy: 'callback',
    });
  },

  /**
   * The webhook. Source of truth (ADR 0005).
   *
   * @param {Buffer} rawBody the exact bytes received — NOT a re-serialised object
   */
  async handleWebhook({ rawBody, signature, eventId }) {
    if (!env.razorpay.webhookSecret) {
      // Refusing beats accepting unverifiable instructions to mark orders
      // paid. A 503 also makes Razorpay retry once it is configured.
      logger.error('A Razorpay webhook arrived but RAZORPAY_WEBHOOK_SECRET is not set — rejected.');
      throw new ValidationError('Webhooks are not configured on this server.');
    }

    if (!verifyWebhookSignature(rawBody, signature)) {
      logger.warn({ eventId }, 'Rejected a webhook with an invalid signature');
      throw new BadRequestError('INVALID_SIGNATURE', 'Signature verification failed.');
    }

    const body = JSON.parse(rawBody.toString('utf8'));
    const event = body.event;

    // The insert IS the claim. Two concurrent deliveries of the same event
    // race here, the unique index rejects one, and exactly one proceeds.
    // Checking first and inserting later would be a check-then-act race.
    let record;
    try {
      record = await WebhookEvent.create({
        providerEventId: eventId,
        event,
        payload: body,
        status: 'Received',
      });
    } catch (err) {
      if (err.code === 11000) {
        logger.info({ eventId, event }, 'Duplicate webhook ignored');
        return { duplicate: true, event };
      }
      throw err;
    }

    if (!HANDLED_EVENTS.has(event)) {
      // Acknowledge rather than error: a non-2xx on an event we simply do not
      // handle makes Razorpay retry it for days.
      await WebhookEvent.updateOne({ _id: record._id }, { status: 'Ignored', processedAt: new Date() });
      return { ignored: true, event };
    }

    try {
      const result = await applyEvent(event, body, eventId);
      await WebhookEvent.updateOne(
        { _id: record._id },
        { status: 'Processed', processedAt: new Date() }
      );
      return { ...result, event };
    } catch (err) {
      await WebhookEvent.updateOne({ _id: record._id }, { status: 'Failed', error: err.message });
      // Rethrow so Razorpay retries. The stored payload means it can also be
      // replayed by hand.
      throw err;
    }
  },

  /**
   * Releases stock held by orders that were never paid for.
   *
   * Without this, one abandoned Checkout removes a unit from sale permanently.
   * Run it on a schedule; it is safe to run at any time because it only
   * touches orders still in PendingPayment past the window.
   */
  async expireStale({ olderThanMs = PAYMENT_WINDOW_MS } = {}) {
    const cutoff = new Date(Date.now() - olderThanMs);

    // 'Failed' as well as 'Pending'. A declined card sets payment.status to
    // Failed while the order stays in PendingPayment so the customer can
    // retry — matching only 'Pending' here meant a declined order held its
    // stock forever.
    const stale = await Order.find(
      {
        status: 'PendingPayment',
        'payment.status': { $in: ['Pending', 'Failed'] },
        createdAt: { $lt: cutoff },
      },
      { _id: 1 }
    ).limit(100);

    let released = 0;
    for (const { _id } of stale) {
      if (await releasePendingOrder(_id, 'Payment was not completed in time; reserved stock released.')) {
        released += 1;
      }
    }

    if (released) logger.info({ released }, 'Released stock from unpaid orders');
    return { released };
  },

  /**
   * Called when the same customer starts a new online checkout. Their earlier
   * unpaid attempt is cancelled and its stock put back FIRST, so the new
   * attempt can reserve the same units — otherwise retrying a low-stock item
   * fails against your own abandoned order, and every retry leaks stock until
   * expireStale runs.
   */
  async supersedePendingOrders(customerId) {
    const pending = await Order.find(
      { customerId, status: 'PendingPayment', 'payment.status': { $ne: 'Paid' } },
      { _id: 1 }
    );

    let released = 0;
    for (const { _id } of pending) {
      if (await releasePendingOrder(_id, 'Replaced by a newer checkout attempt; reserved stock released.')) {
        released += 1;
      }
    }
    return { released };
  },
};

// ---------------------------------------------------------------- internals

/**
 * Cancels one unpaid order and puts its stock back — exactly once.
 *
 * The cancel is a conditional update, and stock is only released if THIS call
 * made it. Find-then-save would race: a payment confirming at the same moment
 * could leave an order both paid and with its stock released, or release the
 * same units twice.
 *
 * @returns {Promise<boolean>} whether this call cancelled it
 */
async function releasePendingOrder(orderId, note) {
  const cancelled = await Order.findOneAndUpdate(
    { _id: orderId, status: 'PendingPayment', 'payment.status': { $ne: 'Paid' } },
    {
      $set: { status: 'Cancelled', 'payment.status': 'Failed' },
      $push: { statusHistory: { status: 'Cancelled', at: new Date(), byRole: 'system', note } },
    },
    { new: true }
  );
  if (!cancelled) return false;

  await Promise.all(
    cancelled.items.map((item) => productRepo.releaseStock(item.productId, item.quantity))
  );
  await Payment.updateMany(
    { orderId, status: 'Created' },
    { status: 'Failed', failureReason: note }
  );
  return true;
}

/** Takes stock for every line, or none of it. */
async function reserveAll(items) {
  const taken = [];
  for (const item of items) {
    const ok = await productRepo.reserveStock(item.productId, item.quantity);
    if (!ok) {
      await Promise.all(taken.map((t) => productRepo.releaseStock(t.productId, t.quantity)));
      return false;
    }
    taken.push(item);
  }
  return true;
}

/**
 * Removes what was just paid for from the customer's cart.
 *
 * Quantities are subtracted rather than lines deleted: if they added another
 * unit of the same thing while the payment window was open, that unit stays.
 * Saved-for-later lines are never touched.
 */
async function clearPurchasedFromCart(order) {
  const cart = await cartRepo.find({ userId: order.customerId });
  if (!cart) return;

  const bought = new Map(order.items.map((item) => [String(item.productId), item.quantity]));

  cart.items = cart.items
    .map((line) => {
      const qty = bought.get(String(line.productId));
      if (!qty || line.savedForLater) return line;
      line.quantity -= qty;
      return line;
    })
    .filter((line) => line.savedForLater || line.quantity > 0);

  if (cart.couponCode && cart.couponCode === order.couponCode) cart.couponCode = null;
  await cartRepo.save(cart);
}

/**
 * The single place an order becomes paid. The browser callback and the
 * webhook both call it, so the two paths cannot drift apart.
 *
 * 1. CLAIM. One atomic update flips payment.status to Paid if it was not
 *    already. Only the caller that makes that flip continues, so a duplicate
 *    (callback AND webhook, or a retried webhook) does nothing: one stock
 *    revival, one coupon redemption, one cart clear, one email.
 *
 * 2. LATE PAYMENT. The claim returns the order as it was. If it had already
 *    been cancelled — the customer abandoned it, it expired, or they started
 *    a new checkout — its stock was put back. Take it again; if it has sold
 *    in the meantime, the money is real but the goods are not, so the order
 *    is flagged needsRefund rather than silently shipped short.
 *
 * 3. Only then: Processing, coupon redeemed, cart cleared, receipt sent. The
 *    coupon and the cart are done HERE, not at checkout, because until now
 *    nothing had been bought — a cancelled payment used to burn a single-use
 *    coupon and empty the cart for an order that never happened.
 */
async function markPaid({ payment, providerPaymentId, method, confirmedBy, providerEventId }) {
  const now = new Date();

  const before = await Order.findOneAndUpdate(
    { _id: payment.orderId, 'payment.status': { $ne: 'Paid' } },
    {
      $set: {
        'payment.status': 'Paid',
        'payment.providerPaymentId': providerPaymentId,
        'payment.paidAt': now,
      },
    },
    { new: false }
  );

  // The provider's record is updated whichever way this goes.
  await Payment.updateOne(
    { _id: payment._id },
    {
      $set: {
        status: 'Captured',
        providerPaymentId,
        method: method ?? payment.method,
        confirmedBy: payment.confirmedBy ?? confirmedBy,
      },
      $push: { events: { event: 'captured', at: now, providerEventId } },
    }
  );

  if (!before) {
    logger.info({ orderId: String(payment.orderId), confirmedBy }, 'Payment already confirmed');
    return { alreadyConfirmed: true, orderId: String(payment.orderId) };
  }

  const orderId = before._id;

  // ------------------------------------------------------- late payment
  if (before.status === 'Cancelled') {
    const revived = await reserveAll(before.items);
    if (!revived) {
      await Order.updateOne(
        { _id: orderId },
        {
          $set: { 'payment.needsRefund': true },
          $push: {
            statusHistory: {
              status: 'Cancelled',
              at: now,
              byRole: 'system',
              note: 'Payment arrived after this order was released, and the stock has since sold. Needs a refund.',
            },
          },
        }
      );
      logger.error(
        { orderId: String(orderId), providerPaymentId },
        'PAID BUT UNFULFILLABLE — payment captured for a released order whose stock is gone. Refund required.'
      );
      return { needsRefund: true, orderId: String(orderId) };
    }
  }

  const order = await Order.findOneAndUpdate(
    { _id: orderId },
    {
      $set: { status: 'Processing' },
      $push: {
        statusHistory: {
          status: 'Processing',
          at: now,
          byRole: 'system',
          note:
            before.status === 'Cancelled'
              ? `Late payment confirmed via ${confirmedBy}; order restored.`
              : `Payment confirmed via ${confirmedBy}.`,
        },
      },
    },
    { new: true }
  );

  // Money has arrived, so nothing below may fail the confirmation. Each step
  // logs its own failure and the next still runs.
  if (order.couponCode && (order.amounts?.discountTotal ?? 0) > 0) {
    await couponService
      .redeem({
        code: order.couponCode,
        userId: order.customerId,
        orderId: order._id,
        discountAmount: order.amounts.discountTotal,
      })
      .catch((err) => logger.error({ err: err.message, orderId: String(orderId) }, 'Coupon redemption failed'));
  }

  await clearPurchasedFromCart(order).catch((err) =>
    logger.error({ err: err.message, orderId: String(orderId) }, 'Could not clear purchased items from cart')
  );

  sendInBackground(
    {
      to: order.customerEmail,
      ...templates.orderPlaced({
        name: order.customerName,
        orderId: order._id,
        items: order.items.map((item) => ({
          title: item.title,
          quantity: item.quantity,
          lineTotalLabel: formatINR(item.price * item.quantity),
        })),
        totalLabel: formatINR(order.amounts?.grandTotal ?? order.totalAmount),
        address: order.shippingAddress
          ? [order.shippingAddress.street, order.shippingAddress.city, order.shippingAddress.zipCode]
              .filter(Boolean)
              .join(', ')
          : null,
        appUrl: env.appUrl,
      }),
    },
    { orderId: String(order._id), kind: 'order-paid' }
  );

  return { confirmed: true, orderId: String(order._id) };
}

/** Maps a webhook event onto the payment it concerns. */
async function applyEvent(event, body, eventId) {
  const entity = body.payload?.payment?.entity ?? body.payload?.order?.entity ?? null;
  if (!entity) throw new Error(`Webhook ${event} carried no payment entity`);

  const providerOrderId = entity.order_id ?? entity.id;
  const payment = await Payment.findOne({ providerOrderId });

  if (!payment) {
    // A payment we have no record of. Not retryable — retrying will never
    // make it exist — so it is recorded and acknowledged.
    logger.warn({ providerOrderId, event }, 'Webhook for an unknown payment');
    return { unknown: true };
  }

  if (event === 'payment.failed') {
    await Payment.updateOne(
      { _id: payment._id },
      {
        $set: {
          status: 'Failed',
          providerPaymentId: entity.id,
          failureReason: entity.error_description ?? entity.error_reason ?? 'Payment failed',
        },
        $push: { events: { event: 'failed', at: new Date(), providerEventId: eventId } },
      }
    );
    // The order is deliberately left in PendingPayment: the customer can
    // retry, and expireStale() releases the stock if they do not.
    await Order.updateOne({ _id: payment.orderId }, { 'payment.status': 'Failed' });
    return { failed: true };
  }

  // payment.captured / order.paid
  if (entity.amount !== payment.amount) {
    throw new Error(
      `Webhook amount ${entity.amount} does not match order amount ${payment.amount}`
    );
  }

  return markPaid({
    payment,
    providerPaymentId: entity.id,
    method: entity.method,
    confirmedBy: 'webhook',
    providerEventId: eventId,
  });
}

export const __testing = {
  markPaid,
  applyEvent,
  releasePendingOrder,
  clearPurchasedFromCart,
  PAYMENT_WINDOW_MS,
  mongoose,
};
