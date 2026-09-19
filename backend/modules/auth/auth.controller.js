// modules/auth/auth.controller.js — HTTP only: read the request, call a
// service, shape a response. No database access, no business rules.
import { asyncHandler } from '../../lib/asyncHandler.js';
import { authService } from './auth.service.js';
import { passwordResetService } from './passwordReset.service.js';

/**
 * The OTP response has to say where the code actually went.
 *
 * Saying "sent to your email" when SMTP is not configured is the kind of
 * untrue-but-successful response that wastes an afternoon: the browser shows
 * a confirmation, nothing arrives, and nothing is logged as an error. In
 * development the code goes to the API console, and the response now says so.
 */
function otpResponse(result) {
  if (result?.emailed) {
    return {
      message: 'Verification code sent to your email',
      emailed: true,
      ...(result?.debug ? { debug: result.debug } : {}),
    };
  }

  return {
    message:
      'Email is not configured on this server, so the verification code was printed ' +
      'to the API console instead. Copy it from the terminal running the API.',
    emailed: false,
    deliveredTo: result?.deliveredTo ?? 'console',
    ...(result?.debug ? { debug: result.debug } : {}),
  };
}

export const authController = {
  sendCustomerOtp: asyncHandler(async (req, res) => {
    const result = await authService.sendOtp(req.body.email, 'customer-signup');
    res.json(otpResponse(result));
  }),

  sendVendorOtp: asyncHandler(async (req, res) => {
    const result = await authService.sendOtp(req.body.email, 'vendor-signup');
    res.json(otpResponse(result));
  }),

  verifyOtp: asyncHandler(async (req, res) => {
    await authService.verifyOtp(req.body.email, req.body.otp);
    res.json({ message: 'Email verified' });
  }),

  registerCustomer: asyncHandler(async (req, res) => {
    const result = await authService.registerCustomer(req.body);
    res.status(201).json({ message: 'Account created', ...result });
  }),

  loginCustomer: asyncHandler(async (req, res) => {
    const result = await authService.loginCustomer(req.body);
    res.json({ message: 'Login successful', ...result });
  }),

  registerVendor: asyncHandler(async (req, res) => {
    const result = await authService.registerVendor(req.body);
    res.status(201).json({ message: 'Vendor account created', ...result });
  }),

  loginVendor: asyncHandler(async (req, res) => {
    const result = await authService.loginVendor(req.body);
    res.json({ message: 'Login successful', ...result });
  }),

  // Always 200 with the same message, whether or not the account exists.
  forgotPassword: asyncHandler(async (req, res) => {
    res.json(await passwordResetService.requestReset(req.body));
  }),

  resetPassword: asyncHandler(async (req, res) => {
    res.json(await passwordResetService.resetPassword(req.body));
  }),

  me: asyncHandler(async (req, res) => {
    const customer = await authService.getCustomerProfile(req.user.id);
    // Key kept as `customer` for the existing Profile page.
    res.json({ customer });
  }),
};
