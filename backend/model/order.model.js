import mongoose from 'mongoose';

import { FULFILLMENT_STATUSES } from '../lib/fulfillment.js';
import { CARRIER_KEYS } from '../lib/carriers.js';

// Every line is a snapshot taken at the moment the order was placed. Title and
// price are copied deliberately: if a vendor edits the product or its price
// later, a past order must still show what the customer actually bought.
const orderItemSchema = new mongoose.Schema(
  {
    productId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Product',
      required: true,
    },
    title: { type: String, required: true },
    // Integer paise — see docs/adr/0003.
    price: { type: Number, required: true, min: 0 },
    quantity: { type: Number, required: true, min: 1 },
    image: { type: String },
    // Which vendor owns this line. Lets a vendor be shown only the orders
    // that contain their own products.
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
    },
  },
  { _id: false }
);

// PendingPayment is the state an online order sits in between "stock is
// reserved for you" and "the money arrived". Without it, an order is either
// created before payment (and a customer who abandons Checkout has silently
// bought something) or created after (and the stock they were shown could be
// gone by the time they pay). Cash on delivery skips it — there is nothing to
// wait for.
/**
 * A checkout attempt that was never paid and has since been cancelled — the
 * customer closed the Razorpay window, retried, or let it expire. It was never
 * a real order from anyone's point of view, so it is hidden from lists.
 *
 * `paidAt: null` matches a missing field too, so orders created before the
 * payment block existed are never mistaken for abandoned ones.
 */
export const ABANDONED_ORDER = {
  status: 'Cancelled',
  'payment.status': 'Failed',
  'payment.paidAt': null,
};

/**
 * What a vendor may see and act on: money has arrived (or it is cash on
 * delivery). An order still in PendingPayment must never appear on a vendor's
 * list — shipping it would be shipping something nobody has paid for.
 */
export const VENDOR_VISIBLE_ORDER = {
  status: { $ne: 'PendingPayment' },
  $nor: [ABANDONED_ORDER],
};

export const ORDER_STATUSES = [
  'PendingPayment',
  'Pending',
  'Processing',
  // Some packages are with the courier, some are still being packed. Only
  // possible when an order has items from more than one vendor.
  'PartiallyShipped',
  'Shipped',
  'Delivered',
  'Cancelled',
];

const fulfillmentEventSchema = new mongoose.Schema(
  {
    status: { type: String, enum: FULFILLMENT_STATUSES, required: true },
    at: { type: Date, default: Date.now },
    byRole: { type: String },
    note: { type: String },
  },
  { _id: false }
);

/**
 * One vendor's package within an order.
 *
 * `productIds` rather than copies of the lines: the lines already live on the
 * order, and a second copy is a second thing to keep in sync.
 */
const fulfillmentSchema = new mongoose.Schema(
  {
    vendorId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', default: null },
    productIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
    status: { type: String, enum: FULFILLMENT_STATUSES, default: 'Pending' },

    carrier: { type: String, enum: [...CARRIER_KEYS, null], default: null },
    // Only for carrier: 'other'.
    carrierName: { type: String, trim: true, maxlength: 60, default: null },
    trackingNumber: { type: String, trim: true, maxlength: 40, default: null },
    trackingUrl: { type: String, trim: true, maxlength: 500, default: null },

    shippedAt: { type: Date, default: null },
    outForDeliveryAt: { type: Date, default: null },
    deliveredAt: { type: Date, default: null },
    cancelledAt: { type: Date, default: null },
    cancelReason: { type: String, trim: true, maxlength: 300, default: null },

    history: [fulfillmentEventSchema],
  },
  // An _id per package, so an admin (or a future split-shipment feature) can
  // address one precisely.
  { _id: true }
);

const orderSchema = new mongoose.Schema(
  {
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cutomers',
      required: true,
      index: true,
    },
    customerName: { type: String },
    customerEmail: { type: String },
    items: {
      type: [orderItemSchema],
      validate: {
        validator: (items) => Array.isArray(items) && items.length > 0,
        message: 'An order must contain at least one item',
      },
    },
    // Computed on the server from current product prices — never accepted
    // from the client. `totalAmount` is kept as the grand total so existing
    // clients keep working; `amounts` is the full breakdown an invoice needs.
    totalAmount: {
      type: Number,
      required: true,
      min: 0,
    },
    amounts: {
      itemsSubtotal: { type: Number, default: 0, min: 0 },
      discountTotal: { type: Number, default: 0, min: 0 },
      taxTotal: { type: Number, default: 0, min: 0 },
      shippingTotal: { type: Number, default: 0, min: 0 },
      grandTotal: { type: Number, default: 0, min: 0 },
    },
    couponCode: { type: String, uppercase: true, trim: true, default: null },
    // Snapshot of the address as it was at purchase. Editing the saved address
    // later must not rewrite where a past order went.
    addressId: { type: mongoose.Schema.Types.ObjectId, ref: 'Address', default: null },
    shippingAddress: {
      street: { type: String, required: true },
      city: { type: String, required: true },
      zipCode: { type: String, required: true },
      phone: { type: String, required: true },
    },
    paymentMethod: {
      type: String,
      // Card/UPI are the legacy labels the old checkout sent. Razorpay is the
      // real online path: the specific instrument (card, upi, netbanking,
      // wallet) is whatever the provider reports, and is recorded on the
      // Payment document rather than guessed here.
      enum: ['Card', 'UPI', 'COD', 'Razorpay'],
      default: 'COD',
    },
    status: {
      type: String,
      enum: ORDER_STATUSES,
      default: 'Pending',
      index: true,
    },
    // Append-only audit trail, so "order tracking" shows a real timeline
    // rather than just the latest value.
    // Denormalised onto the order so the orders list does not need a second
    // query per row. The Payment document is the detailed record.
    payment: {
      status: {
        type: String,
        enum: ['NotRequired', 'Pending', 'Paid', 'Failed', 'Refunded'],
        default: 'NotRequired',
        index: true,
      },
      provider: { type: String, default: null },
      providerOrderId: { type: String, default: null, index: true },
      providerPaymentId: { type: String, default: null },
      paidAt: { type: Date, default: null },
      // Money arrived for an order whose stock had already been released
      // (the customer abandoned it, then a late payment landed) and the stock
      // could not be taken again. Somebody has to refund it by hand; this is
      // the flag they search for.
      needsRefund: { type: Boolean, default: false, index: true },
    },

    statusHistory: [
      {
        status: { type: String, enum: ORDER_STATUSES, required: true },
        at: { type: Date, default: Date.now },
        byRole: { type: String },
        // Why it changed. This field was missing, so strict mode silently
        // dropped every note written here ("Payment confirmed via webhook",
        // "reserved stock released") — the history said WHAT happened but
        // never why.
        note: { type: String },
        _id: false,
      },
    ],

    // One package per vendor — see lib/fulfillment.js. The order's own status
    // is derived from these and never set directly once they exist.
    fulfillments: [fulfillmentSchema],

    // Bumped on every package transition. The recompute of the order's status
    // writes only if this has not moved since it read the packages, so two
    // vendors shipping at the same instant cannot leave a stale status behind.
    fulfillmentVersion: { type: Number, default: 0 },
    // Denormalised list of vendors with a line in this order, so the vendor
    // order query is a single indexed lookup instead of a scan over items.
    vendorIds: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        index: true,
      },
    ],
  },
  {
    timestamps: true,
  }
);

// "My orders, newest first" and "this vendor's orders, newest first".
orderSchema.index({ customerId: 1, createdAt: -1 });
orderSchema.index({ vendorIds: 1, createdAt: -1 });

const Order = mongoose.model('Order', orderSchema);
export default Order;
