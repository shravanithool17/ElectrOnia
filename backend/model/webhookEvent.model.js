// model/webhookEvent.model.js — webhook idempotency (ADR 0005).
//
// Razorpay retries a webhook until it gets a 2xx, and it can deliver the same
// event more than once even after a 200 — at-least-once, never exactly-once.
// Without a guard, a retried `payment.captured` credits the vendor ledger
// twice and emails the customer twice.
//
// The guard is a unique index on the provider's own event id, and the INSERT
// is what claims the event: inserting first and processing second means two
// concurrent deliveries race on the database, and exactly one wins. Checking
// "have I seen this?" and then processing is a check-then-act race that fails
// under precisely the concurrency it is meant to handle.
import mongoose from 'mongoose';

const webhookEventSchema = new mongoose.Schema(
  {
    provider: { type: String, default: 'razorpay' },

    // Razorpay's x-razorpay-event-id header. Unique — this index IS the
    // idempotency guarantee, so it must never be dropped.
    providerEventId: { type: String, required: true, unique: true },

    event: { type: String, required: true, index: true },

    status: {
      type: String,
      enum: ['Received', 'Processed', 'Failed', 'Ignored'],
      default: 'Received',
      index: true,
    },

    // Kept so a failed event can be replayed by hand without asking Razorpay
    // to resend it.
    payload: { type: mongoose.Schema.Types.Mixed },

    error: { type: String, default: null },
    processedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.WebhookEvent ||
  mongoose.model('WebhookEvent', webhookEventSchema);
