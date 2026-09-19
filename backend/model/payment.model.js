// model/payment.model.js — one row per payment attempt.
//
// Kept separate from the order because they are not one-to-one: a customer can
// fail a card, retry with UPI, and succeed. The order is the commercial event;
// each attempt is a row here, so "why did this order take three tries" is a
// query rather than a guess.
//
// Amounts are integer paise (ADR 0003), matching both the order and Razorpay's
// smallest-unit convention, so nothing is converted anywhere in this path.
import mongoose from 'mongoose';

export const PAYMENT_STATUSES = ['Created', 'Authorized', 'Captured', 'Failed', 'Refunded'];

const paymentSchema = new mongoose.Schema(
  {
    orderId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Order',
      required: true,
      index: true,
    },
    customerId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cutomers',
      required: true,
      index: true,
    },

    provider: { type: String, default: 'razorpay' },

    // Razorpay's order id (order_xxx). Unique because one provider order is
    // created per attempt, and a duplicate would mean we lost track of one.
    providerOrderId: { type: String, required: true, unique: true, index: true },

    // Razorpay's payment id (pay_xxx). Absent until the customer actually
    // pays, so it is sparse — a unique index over many nulls would collide.
    providerPaymentId: { type: String, default: null, index: true, sparse: true },

    amount: {
      type: Number,
      required: true,
      // The amount is the thing an attacker most wants to change, so it is
      // validated on the way in rather than trusted.
      validate: {
        validator: Number.isInteger,
        message: 'Payment amount must be an integer number of paise',
      },
    },
    currency: { type: String, default: 'INR' },

    status: {
      type: String,
      enum: PAYMENT_STATUSES,
      default: 'Created',
      index: true,
    },

    // Razorpay's own method label (card / upi / netbanking / wallet), recorded
    // as reported rather than as requested.
    method: { type: String, default: null },

    failureReason: { type: String, default: null },

    // Which path confirmed this: the browser callback or the webhook. Useful
    // when reconciling, because only one of them is authoritative.
    confirmedBy: { type: String, enum: ['callback', 'webhook', null], default: null },

    events: [
      {
        _id: false,
        event: String,
        at: { type: Date, default: Date.now },
        providerEventId: String,
      },
    ],
  },
  { timestamps: true }
);

// The reconciliation query: everything still unpaid, oldest first.
paymentSchema.index({ status: 1, createdAt: 1 });

export default mongoose.models.Payment || mongoose.model('Payment', paymentSchema);
