// modules/payments/payment.controller.js — HTTP only.
import { asyncHandler } from '../../lib/asyncHandler.js';
import { logger } from '../../config/logger.js';
import { paymentService } from './payment.service.js';

export const paymentController = {
  createIntent: asyncHandler(async (req, res) => {
    res.status(201).json(await paymentService.createIntent(req.user, req.body.orderId));
  }),

  confirm: asyncHandler(async (req, res) => {
    const result = await paymentService.confirmFromCallback(req.user, {
      razorpayOrderId: req.body.razorpay_order_id,
      razorpayPaymentId: req.body.razorpay_payment_id,
      signature: req.body.razorpay_signature,
    });
    res.json(result);
  }),

  /**
   * Razorpay's webhook. Two things make this different from every other route:
   *
   *   - req.rawBody, not req.body. The signature is over the exact bytes; a
   *     re-serialised object can differ in key order or spacing and fail
   *     verification intermittently.
   *   - it must answer 2xx quickly. Razorpay retries anything else, so a slow
   *     handler turns into duplicate deliveries.
   */
  webhook: asyncHandler(async (req, res) => {
    const result = await paymentService.handleWebhook({
      rawBody: req.rawBody,
      signature: req.get('x-razorpay-signature'),
      eventId: req.get('x-razorpay-event-id'),
    });

    logger.info({ ...result }, 'Razorpay webhook handled');
    res.json({ received: true });
  }),
};
