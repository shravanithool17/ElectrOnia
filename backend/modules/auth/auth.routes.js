import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { otpLimiter, loginLimiter, passwordResetLimiter } from '../../middleware/rateLimiters.js';
import { authController } from './auth.controller.js';
import {
  sendOtpSchema,
  verifyOtpSchema,
  customerRegisterSchema,
  vendorRegisterSchema,
  loginSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
} from './auth.schema.js';

export const authRoutes = Router();

authRoutes.post('/send-otp', otpLimiter, validate(sendOtpSchema), authController.sendCustomerOtp);
authRoutes.post('/vendor/send-otp', otpLimiter, validate(sendOtpSchema), authController.sendVendorOtp);
authRoutes.post('/verify-otp', otpLimiter, validate(verifyOtpSchema), authController.verifyOtp);

authRoutes.post('/customers/register', validate(customerRegisterSchema), authController.registerCustomer);
authRoutes.post('/customers/login', loginLimiter, validate(loginSchema), authController.loginCustomer);

authRoutes.post('/vendors/register', validate(vendorRegisterSchema), authController.registerVendor);
authRoutes.post('/vendors/login', loginLimiter, validate(loginSchema), authController.loginVendor);

// Forgot password — same routes for both account types; `role` picks which.
authRoutes.post('/password/forgot', passwordResetLimiter, validate(forgotPasswordSchema), authController.forgotPassword);
authRoutes.post('/password/reset', passwordResetLimiter, validate(resetPasswordSchema), authController.resetPassword);

authRoutes.get('/me', requireAuth, requireRole(ROLES.CUSTOMER), authController.me);
