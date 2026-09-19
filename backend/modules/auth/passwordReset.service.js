// modules/auth/passwordReset.service.js — "forgot password", for customers and vendors.
//
// The flow is the same shape as signup: a 6-digit code goes to the email on
// the account, and typing it back proves you own that inbox. No reset links —
// a code cannot be pre-clicked by a mail scanner, and it matches what people
// already did once to sign up.
//
//   1. requestReset(email)   → always the same answer, whether or not the
//                              account exists, so this form cannot be used to
//                              find out who has an account
//   2. resetPassword(...)    → checks the code, sets the new password, signs
//                              them straight in, and emails "your password was
//                              changed" so a reset they did not make is noticed
//
// Guarantees (each one is a test in tests/unit/passwordReset.test.js):
//   - the code is stored only as a bcrypt hash, on the account itself (so it
//     survives an API restart, unlike the signup codes in lib/otpStore.js)
//   - 15 minutes to use it, 5 guesses, then a new code is needed
//   - a code works once, even if two requests race with it
//   - asking again within a minute does not send another email
//   - a customer code cannot reset the vendor account with the same email
import bcrypt from 'bcrypt';
import crypto from 'crypto';

import { env } from '../../config/env.js';
import { signToken, ROLES } from '../../middleware/auth.js';
import { BadRequestError } from '../../lib/errors.js';
import { logger } from '../../config/logger.js';
import { send, sendInBackground, isMailConfigured, templates } from '../../lib/mailer.js';
import { customerRepo, vendorRepo } from './auth.repo.js';

export const RESET_TTL_MS = 15 * 60 * 1000;
export const RESET_MAX_ATTEMPTS = 5;
export const RESET_COOLDOWN_MS = 60 * 1000;
const BCRYPT_ROUNDS = 12;

export const GENERIC_REQUEST_MESSAGE =
  'If an account exists for that email, a 6-digit code is on its way. It expires in 15 minutes.';

const INVALID_CODE_MESSAGE = 'That code is wrong or has expired. Request a new one.';

// Used when the email has no account, so both paths do the same bcrypt work
// and take about the same time.
const DUMMY_HASH = bcrypt.hashSync('000000', 10);

export function createPasswordResetService({
  repos = { customer: customerRepo, vendor: vendorRepo },
  mailer = { send, sendInBackground, isMailConfigured },
  now = () => new Date(),
  hashRounds = BCRYPT_ROUNDS,
  // Development only: the response also says what really happened. Never in
  // production or automated tests — there it would reveal which emails have accounts.
  debug = !env.isProd && !env.isTest,
} = {}) {
  const repoFor = (role) => (role === 'vendor' ? repos.vendor : repos.customer);

  function tokenFor(account, role) {
    const claims = { id: account._id, email: account.email, name: account.name };
    return role === 'vendor'
      ? { vendorToken: signToken({ ...claims, role: ROLES.VENDOR }) }
      : { token: signToken({ ...claims, role: ROLES.CUSTOMER }) };
  }

  const withDebug = (response, info) => (debug ? { ...response, debug: info } : response);

  /** Where the code went, stated honestly — without revealing whether the account exists. */
  function requestResponse() {
    if (mailer.isMailConfigured()) return { message: GENERIC_REQUEST_MESSAGE, emailed: true };
    return {
      message:
        'Email is not configured on this server. If the account exists, the reset code was ' +
        'printed to the API console — copy it from the terminal running the API.',
      emailed: false,
      deliveredTo: 'console',
    };
  }

  return {
    async requestReset({ email, role = 'customer' }) {
      const repo = repoFor(role);
      const account = await repo.findByEmail(email);

      if (!account) {
        await bcrypt.compare('000000', DUMMY_HASH);
        // Say it plainly in the log, and in development in the response too.
        // "If an account exists…" is the right answer for the public, but for
        // the developer it hid the most common reason nothing arrives: the
        // email belongs to the OTHER account type (a vendor using the
        // customer form, or the reverse), or was typed differently at signup.
        const other = role === 'vendor' ? repos.customer : repos.vendor;
        const otherRole = role === 'vendor' ? 'customer' : 'vendor';
        const inOther = Boolean(await other.findByEmail(email));
        logger.info({ email, role, inOther }, 'Password reset: no account with this email');
        return withDebug(requestResponse(), {
          outcome: 'NO_ACCOUNT',
          detail: inOther
            ? `No ${role} account uses ${email}, but a ${otherRole} account does. Use the ${otherRole} "Forgot password?" link instead.`
            : `No ${role} account uses ${email}. Check the spelling, or sign up.`,
          otherRole: inOther ? otherRole : undefined,
        });
      }

      const code = String(crypto.randomInt(100000, 1000000));
      const at = now();
      const reset = {
        hash: await bcrypt.hash(code, 10),
        expiresAt: new Date(at.getTime() + RESET_TTL_MS),
        attempts: 0,
        requestedAt: at,
      };

      const result = await repo.startReset(
        account._id,
        reset,
        new Date(at.getTime() - RESET_COOLDOWN_MS)
      );

      // Inside the cooldown: the earlier code is still valid and still in
      // their inbox. Same answer, no second email.
      if (!result?.modifiedCount) {
        logger.info({ email, role }, 'Password reset: code requested again within a minute — not resent');
        return withDebug(requestResponse(), {
          outcome: 'COOLDOWN',
          detail: 'A code was sent less than a minute ago, so no new email was sent. Check your inbox and spam — or wait a minute and resend.',
        });
      }

      const message = {
        to: account.email,
        ...templates.passwordResetCode({
          code,
          name: account.name,
          minutes: RESET_TTL_MS / 60000,
          role,
        }),
      };

      if (!debug) {
        // Production: in the background, so the response time does not depend
        // on whether an account exists (only the "exists" path waits on SMTP).
        // A failure is still logged by the mailer.
        mailer.sendInBackground(message, { kind: 'password-reset', role });
        return requestResponse();
      }

      // Development: wait for SMTP and report exactly what it said. The first
      // version sent this in the background too, which meant a failed send
      // looked identical to a successful one from the browser.
      const sent = await mailer.send(message);
      if (sent?.sent) {
        return withDebug(requestResponse(), {
          outcome: 'SENT',
          detail: `Email accepted by the mail server for ${account.email}. If it isn't in the inbox, check Spam and "All Mail".`,
        });
      }
      if (sent?.reason === 'NOT_CONFIGURED') {
        return withDebug(requestResponse(), { outcome: 'CONSOLE', detail: 'SMTP is not configured — the code is in the API terminal.' });
      }

      // The code can't reach them, so don't leave it live: let them retry now
      // instead of waiting out the cooldown.
      await repo.startReset(account._id, { ...reset, requestedAt: new Date(0) }, new Date(8.64e15));
      return withDebug(requestResponse(), {
        outcome: 'SEND_FAILED',
        detail: `The mail server refused the email: ${sent?.error ?? 'unknown error'}. Run \`npm run mail:test\` in backend/ for the exact reason.`,
      });
    },

    async resetPassword({ email, role = 'customer', code, password }) {
      const repo = repoFor(role);
      const at = now();

      // Spend a guess first, check it second. A live code with guesses left
      // is the only thing that matches; everything else gets one message.
      const account = await repo.claimAttempt(email, at, RESET_MAX_ATTEMPTS);
      if (!account?.passwordReset) {
        throw new BadRequestError('RESET_CODE_INVALID', INVALID_CODE_MESSAGE);
      }

      const { hash, attempts } = account.passwordReset;
      const matches = await bcrypt.compare(String(code), hash);

      if (!matches) {
        const left = RESET_MAX_ATTEMPTS - attempts;
        throw new BadRequestError(
          'RESET_CODE_INVALID',
          left > 0
            ? `That code is not right. ${left} attempt${left === 1 ? '' : 's'} left.`
            : 'Too many wrong attempts. Request a new code.'
        );
      }

      const passwordHash = await bcrypt.hash(password, hashRounds);
      const done = await repo.completeReset(account._id, hash, passwordHash, at);

      // Someone else spent this exact code between our check and our write.
      if (!done?.modifiedCount) {
        throw new BadRequestError('RESET_CODE_USED', 'This code has already been used. Request a new one.');
      }

      mailer.sendInBackground(
        {
          to: account.email,
          ...templates.passwordChanged({ name: account.name, role, appUrl: env.appUrl, at }),
        },
        { kind: 'password-changed', role }
      );

      return {
        message: 'Password updated. You are signed in.',
        ...tokenFor(account, role),
      };
    },
  };
}

export const passwordResetService = createPasswordResetService();
