import { Router } from 'express';

import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { paymentController } from './payment.controller.js';
import { createIntentSchema, confirmSchema } from './payment.schema.js';

export const paymentRoutes = Router();

// Customer-facing: opening and confirming a payment for your own order.
paymentRoutes.post(
  '/razorpay/intent',
  requireAuth,
  requireRole(ROLES.CUSTOMER),
  validate(createIntentSchema),
  paymentController.createIntent
);

paymentRoutes.post(
  '/razorpay/confirm',
  requireAuth,
  requireRole(ROLES.CUSTOMER),
  validate(confirmSchema),
  paymentController.confirm
);

/**
 * The webhook is mounted separately in routes/index.js, NOT here: it must be
 * unauthenticated (Razorpay has no token — the signature is the auth) and it
 * needs the raw-body parser rather than the JSON one.
 */
