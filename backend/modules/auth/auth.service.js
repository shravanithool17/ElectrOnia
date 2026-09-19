// modules/auth/auth.service.js — business rules only. No req, no res.
import bcrypt from 'bcrypt';

import { env } from '../../config/env.js';
import { signToken, ROLES } from '../../middleware/auth.js';
import { issueOtp, verifyOtp, isVerified, consumeOtp } from '../../lib/otpStore.js';
import {
  ConflictError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  BadRequestError,
} from '../../lib/errors.js';
import { send, sendInBackground, templates } from '../../lib/mailer.js';
import { customerRepo, vendorRepo } from './auth.repo.js';

const BCRYPT_ROUNDS = 12;


export const authService = {
  /**
   * Issues a code and emails it.
   *
   * This one is NOT fire-and-forget: if the email cannot be delivered, the
   * person is about to sit on a "check your inbox" screen waiting for
   * something that will never arrive. Better to fail the request and say so.
   *
   * NOT_CONFIGURED — no SMTP credentials at all — is handled separately, and
   * differently per environment, because the two cases are not the same bug:
   *
   *   development: the code is printed to the API console. That is the
   *     documented offline path, so the request succeeds — but it returns
   *     `emailed: false` so the caller can say where the code actually went.
   *     Reporting "sent to your email" here is a lie that costs somebody an
   *     hour: nothing errors, nothing arrives, and the only clue is buried in
   *     the server log. (It cost exactly that once already — credentials were
   *     added to .env and nodemon, which does not watch .env, never restarted
   *     the process.)
   *
   *   production: a server that cannot send verification email has a broken
   *     signup, and failing loudly on the first attempt is the whole point.
   */
  async sendOtp(email, purpose = 'signup') {
    const code = await issueOtp(email, purpose);

    const result = await send({
      to: email,
      ...templates.verificationCode({ code, minutes: Math.round(env.otp.ttlMs / 60000) }),
    });

    if (result.sent) {
      return {
        emailed: true,
        ...(!env.isProd && !env.isTest ? { debug: { code, to: email } } : {}),
      };
    }

    if (result.reason === 'NOT_CONFIGURED') {
      if (env.isProd) {
        throw new BadRequestError(
          'EMAIL_NOT_CONFIGURED',
          'Email delivery is not configured on this server, so a verification code cannot be sent.'
        );
      }
      // Development: succeed, but be explicit that nothing was emailed.
      return { emailed: false, deliveredTo: 'console' };
    }

    throw new BadRequestError(
      'EMAIL_SEND_FAILED',
      'We could not send the verification email. Check the address and try again.'
    );
  },

  async verifyOtp(email, otp) {
    const result = await verifyOtp(email, otp);
    if (!result.ok) throw new BadRequestError('OTP_INVALID', result.reason);
  },

  async registerCustomer({ name, email, password, address, phone }) {
    if (!isVerified(email)) {
      throw new ForbiddenError('EMAIL_NOT_VERIFIED', 'Verify your email before signing up');
    }
    if (await customerRepo.findByEmail(email)) {
      throw new ConflictError('EMAIL_IN_USE', 'An account with this email already exists');
    }

    const customer = await customerRepo.create({
      name,
      email,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      address,
      phone,
    });

    // The code is spent — it cannot be reused for another signup.
    consumeOtp(email);

    // Fire-and-forget on purpose. The account exists; a mail provider being
    // down is not a reason to tell the customer their signup failed and have
    // them try again with an email that is now taken.
    sendInBackground(
      { to: customer.email, ...templates.welcome({ name: customer.name, role: 'customer', appUrl: env.appUrl }) },
      { customerId: String(customer._id), kind: 'welcome' }
    );

    return {
      token: signToken({
        id: customer._id,
        email: customer.email,
        name: customer.name,
        role: ROLES.CUSTOMER,
      }),
    };
  },

  async loginCustomer({ email, password }) {
    let user = await customerRepo.findByEmail(email);
    let ok = user && (await bcrypt.compare(password, user.password));

    // If customer authentication failed, check if the person has a vendor account
    // with this email and entered their vendor password.
    if (!ok) {
      const vendor = await vendorRepo.findByEmail(email);
      if (vendor && (await bcrypt.compare(password, vendor.password))) {
        if (user) {
          // Password was updated during vendor registration; sync to customer
          user.password = vendor.password;
          await user.save();
        } else {
          // Vendor wants to shop as a customer: provision customer account
          user = await customerRepo.create({
            name: vendor.name,
            email: vendor.email,
            password: vendor.password,
            address: vendor.address || 'N/A',
            phone: vendor.phone || '0000000000',
          });
        }
        ok = true;
      }
    }

    if (!ok) throw new UnauthorizedError('INVALID_CREDENTIALS', 'Incorrect email or password');

    return {
      token: signToken({
        id: user._id,
        email: user.email,
        name: user.name,
        role: ROLES.CUSTOMER,
      }),
      user: { name: user.name, email: user.email },
    };
  },

  async registerVendor({ name, email, password, address, phone, domain }) {
    if (!isVerified(email)) {
      throw new ForbiddenError('EMAIL_NOT_VERIFIED', 'Verify your email before signing up');
    }
    if (await vendorRepo.findByEmail(email)) {
      throw new ConflictError('EMAIL_IN_USE', 'This email is already registered');
    }

    const company = await vendorRepo.create({
      name,
      email,
      password: await bcrypt.hash(password, BCRYPT_ROUNDS),
      address,
      phone,
      domain,
    });

    consumeOtp(email);

    sendInBackground(
      { to: company.email, ...templates.welcome({ name: company.name, role: 'vendor', appUrl: env.appUrl }) },
      { companyId: String(company._id), kind: 'welcome-vendor' }
    );

    return {
      vendorToken: signToken({
        id: company._id,
        email: company.email,
        name: company.name,
        role: ROLES.VENDOR,
      }),
    };
  },

  async loginVendor({ email, password }) {
    let company = await vendorRepo.findByEmail(email);
    let ok = company && (await bcrypt.compare(password, company.password));

    // If vendor password failed, check if customer account has matching password
    if (company && !ok) {
      const customer = await customerRepo.findByEmail(email);
      if (customer && (await bcrypt.compare(password, customer.password))) {
        company.password = customer.password;
        await company.save();
        ok = true;
      }
    }

    if (!ok) throw new UnauthorizedError('INVALID_CREDENTIALS', 'Incorrect email or password');

    return {
      vendorToken: signToken({
        id: company._id,
        email: company.email,
        name: company.name,
        role: ROLES.VENDOR,
      }),
      company: { name: company.name, email: company.email },
    };
  },

  async getCustomerProfile(id) {
    const customer = await customerRepo.findById(id);
    if (!customer) throw new NotFoundError('Account not found');
    return {
      id: customer._id,
      name: customer.name,
      email: customer.email,
      phone: customer.phone || '',
      address: customer.address || '',
    };
  },
};
