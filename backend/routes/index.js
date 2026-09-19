// routes/index.js — route mounting, and the versioning bridge.
//
// Everything lives under /api/v1. The legacy paths the current frontend calls
// are mounted alongside, pointing at the same routers, so the client can
// migrate without a flag day. Remove the legacy block once the frontend is on
// /v1 — tracked in docs/roadmap.md, Phase 0.
import { Router } from 'express';

import { healthRoutes } from '../modules/health/health.routes.js';
import { mediaRoutes } from '../modules/media/media.routes.js';
import { authRoutes } from '../modules/auth/auth.routes.js';
import { productRoutes } from '../modules/catalog/product.routes.js';
import { orderRoutes } from '../modules/orders/order.routes.js';
import { vendorRoutes } from '../modules/vendor/vendor.routes.js';
import { cartRoutes } from '../modules/cart/cart.routes.js';
import { addressRoutes } from '../modules/addresses/address.routes.js';
import { checkoutRoutes } from '../modules/checkout/checkout.routes.js';
import { paymentRoutes } from '../modules/payments/payment.routes.js';
import { paymentController } from '../modules/payments/payment.controller.js';
import { authController } from '../modules/auth/auth.controller.js';
import { validate } from '../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../middleware/auth.js';
import { otpLimiter, loginLimiter } from '../middleware/rateLimiters.js';
import {
  sendOtpSchema,
  verifyOtpSchema,
  customerRegisterSchema,
  vendorRegisterSchema,
  loginSchema,
} from '../modules/auth/auth.schema.js';

export function mountRoutes(app) {
  // ---- operations -------------------------------------------------------
  app.use('/', healthRoutes);

  // Generated product imagery. Mounted at the root, not under /api, because
  // these are assets an <img> tag fetches, not an API.
  app.use('/', mediaRoutes);

  // ---- v1 ---------------------------------------------------------------
  const v1 = Router();
  v1.use('/auth', authRoutes);
  v1.use('/products', productRoutes);
  v1.use('/orders', orderRoutes);
  v1.use('/vendor', vendorRoutes);
  v1.use('/cart', cartRoutes);
  v1.use('/addresses', addressRoutes);
  v1.use('/checkout', checkoutRoutes);

  // The provider webhook is mounted before the authenticated payment routes
  // and carries NO auth middleware: Razorpay has no bearer token, and the
  // HMAC signature over the raw body is what authenticates it. Anything
  // stricter here just makes every webhook 401 and retry forever.
  v1.post('/payments/razorpay/webhook', paymentController.webhook);
  v1.use('/payments', paymentRoutes);
  app.use('/api/v1', v1);

  // ---- legacy (deprecated) ---------------------------------------------
  // Same routers, old paths. Identical behaviour, no duplicated logic.
  app.use('/api/products', productRoutes);
  app.use('/api/orders', orderRoutes);

  const legacy = Router();
  legacy.post('/send-otp', otpLimiter, validate(sendOtpSchema), authController.sendCustomerOtp);
  legacy.post('/sendvendorotp', otpLimiter, validate(sendOtpSchema), authController.sendVendorOtp);
  legacy.post('/verify-otp', otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);
  // The vendor signup screen posts here. The route did not exist, so vendor
  // OTP verification 404'd — and OtpForm read the error off the wrong key, so
  // it surfaced as a blank message rather than "not found". Verification is
  // identical for both roles (it only checks the code against the email), so
  // this is an alias, not a second implementation.
  legacy.post('/verify-otp-vendor', otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);
  legacy.post('/signupcustomer', validate(customerRegisterSchema), authController.registerCustomer);
  legacy.post('/logincustomer', loginLimiter, validate(loginSchema), authController.loginCustomer);
  legacy.post('/signupvendor', validate(vendorRegisterSchema), authController.registerVendor);
  legacy.post('/loginvendor', loginLimiter, validate(loginSchema), authController.loginVendor);
  legacy.get('/profile', requireAuth, requireRole(ROLES.CUSTOMER), authController.me);
  app.use('/', legacy);
}
