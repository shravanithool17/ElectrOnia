// tests/unit/passwordReset.test.js — forgot password.
//
// There is no database here, so the repo is an in-memory fake that honours
// the same conditions the real Mongo updates use (see auth.repo.js). The
// real queries are covered by tests/integration/passwordReset.test.js.
import { jest } from '@jest/globals';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import request from 'supertest';

import {
  createPasswordResetService,
  RESET_TTL_MS,
  RESET_MAX_ATTEMPTS,
  RESET_COOLDOWN_MS,
  GENERIC_REQUEST_MESSAGE,
} from '../../modules/auth/passwordReset.service.js';
import { forgotPasswordSchema, resetPasswordSchema } from '../../modules/auth/auth.schema.js';
import { templates } from '../../lib/mailer.js';
import { env } from '../../config/env.js';
import { createApp } from '../../server.js';

function fakeRepo(accounts) {
  const byEmail = new Map(accounts.map((a) => [a.email, { ...a }]));
  const byId = (id) => [...byEmail.values()].find((a) => a._id === id);
  return {
    rows: byEmail,
    findByEmail: async (email) => byEmail.get(email) ?? null,
    startReset: async (id, reset, cutoff) => {
      const a = byId(id);
      if (a.passwordReset && a.passwordReset.requestedAt > cutoff) return { modifiedCount: 0 };
      a.passwordReset = { ...reset };
      return { modifiedCount: 1 };
    },
    claimAttempt: async (email, now, max) => {
      const a = byEmail.get(email);
      const r = a?.passwordReset;
      if (!r || !(r.expiresAt > now) || !(r.attempts < max)) return null;
      r.attempts += 1;
      return { _id: a._id, name: a.name, email: a.email, passwordReset: { ...r } };
    },
    completeReset: async (id, hash, passwordHash, now) => {
      const a = byId(id);
      if (a.passwordReset?.hash !== hash) return { modifiedCount: 0 };
      a.password = passwordHash;
      a.passwordChangedAt = now;
      delete a.passwordReset;
      return { modifiedCount: 1 };
    },
  };
}

function setup({ mailConfigured = true, start = new Date('2026-09-19T10:00:00Z'), debug = false, sendResult = { sent: true } } = {}) {
  let clock = start.getTime();
  const customer = fakeRepo([{ _id: 'c1', name: 'Shravani', email: 'shravani@example.com', password: 'old-hash' }]);
  const vendor = fakeRepo([{ _id: 'v1', name: 'Volt Traders', email: 'shravani@example.com', password: 'vendor-old' }]);
  const sent = [];
  const mailer = {
    send: jest.fn(async (message) => { sent.push(message); return sendResult; }),
    sendInBackground: jest.fn((message) => sent.push(message)),
    isMailConfigured: () => mailConfigured,
  };
  const service = createPasswordResetService({
    repos: { customer, vendor },
    mailer,
    now: () => new Date(clock),
    hashRounds: 4,
    debug,
  });
  const lastCode = () => sent.filter((m) => /reset code/.test(m.subject)).at(-1)?.subject.slice(0, 6);
  return { service, customer, vendor, sent, lastCode, tick: (ms) => (clock += ms) };
}

const EMAIL = 'shravani@example.com';

// ============================================================ request

describe('requesting a code', () => {
  it('emails a 6-digit code and stores only its hash', async () => {
    const t = setup();
    const res = await t.service.requestReset({ email: EMAIL });

    expect(res).toEqual({ message: GENERIC_REQUEST_MESSAGE, emailed: true });
    const code = t.lastCode();
    expect(code).toMatch(/^\d{6}$/);
    expect(t.sent[0].to).toBe(EMAIL);

    const stored = t.customer.rows.get(EMAIL).passwordReset;
    expect(stored.hash).not.toContain(code);
    expect(await bcrypt.compare(code, stored.hash)).toBe(true);
    expect(stored.attempts).toBe(0);
  });

  it('answers exactly the same for an email with no account, and sends nothing', async () => {
    const t = setup();
    const known = await t.service.requestReset({ email: EMAIL });
    const unknown = await t.service.requestReset({ email: 'nobody@example.com' });

    expect(unknown).toEqual(known);
    expect(t.sent).toHaveLength(1);
  });

  it('does not send a second email inside the cooldown, and the first code still works', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    const first = t.lastCode();
    t.tick(RESET_COOLDOWN_MS - 1000);
    await t.service.requestReset({ email: EMAIL });

    expect(t.sent).toHaveLength(1);
    await expect(
      t.service.resetPassword({ email: EMAIL, code: first, password: 'new-password-1' })
    ).resolves.toHaveProperty('token');
  });

  it('after the cooldown a new code replaces the old one', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    const first = t.lastCode();
    t.tick(RESET_COOLDOWN_MS + 1);
    await t.service.requestReset({ email: EMAIL });
    const second = t.lastCode();

    expect(t.sent).toHaveLength(2);
    if (first !== second) {
      await expect(
        t.service.resetPassword({ email: EMAIL, code: first, password: 'new-password-1' })
      ).rejects.toMatchObject({ code: 'RESET_CODE_INVALID' });
    }
    await expect(
      t.service.resetPassword({ email: EMAIL, code: second, password: 'new-password-1' })
    ).resolves.toHaveProperty('token');
  });

  it('says the code went to the console when SMTP is not configured — for every email alike', async () => {
    const t = setup({ mailConfigured: false });
    const known = await t.service.requestReset({ email: EMAIL });
    const unknown = await t.service.requestReset({ email: 'nobody@example.com' });

    expect(known.emailed).toBe(false);
    expect(known.deliveredTo).toBe('console');
    expect(known.message).toMatch(/console/);
    expect(unknown).toEqual(known);
  });
});

// ============================================================ dev diagnostics
//
// "The email is not coming" was unanswerable from the browser: the response
// was the same whether the email was sent, refused by SMTP, throttled, or
// had no account. In development it now says which.

describe('development diagnostics', () => {
  it('SENT — waits for SMTP and says it was accepted', async () => {
    const t = setup({ debug: true });
    const res = await t.service.requestReset({ email: EMAIL });
    expect(res.debug.outcome).toBe('SENT');
    expect(t.sent).toHaveLength(1);
  });

  it('NO_ACCOUNT — and points at the other account type when the email lives there', async () => {
    const t = setup({ debug: true });
    t.customer.rows.delete(EMAIL);
    const res = await t.service.requestReset({ email: EMAIL, role: 'customer' });
    expect(res.debug).toMatchObject({ outcome: 'NO_ACCOUNT', otherRole: 'vendor' });
    expect(res.debug.detail).toMatch(/vendor/);

    const none = await t.service.requestReset({ email: 'nobody@example.com' });
    expect(none.debug.otherRole).toBeUndefined();
  });

  it('COOLDOWN — says why no second email went out', async () => {
    const t = setup({ debug: true });
    await t.service.requestReset({ email: EMAIL });
    const res = await t.service.requestReset({ email: EMAIL });
    expect(res.debug.outcome).toBe('COOLDOWN');
  });

  it('SEND_FAILED — surfaces the SMTP error and lets them retry immediately', async () => {
    const t = setup({ debug: true, sendResult: { sent: false, reason: 'SEND_FAILED', error: 'Invalid login: 535 BadCredentials' } });
    const res = await t.service.requestReset({ email: EMAIL });
    expect(res.debug.outcome).toBe('SEND_FAILED');
    expect(res.debug.detail).toMatch(/535 BadCredentials/);

    const retry = await t.service.requestReset({ email: EMAIL });
    expect(retry.debug.outcome).toBe('SEND_FAILED'); // not COOLDOWN
  });

  it('production never includes debug', async () => {
    const t = setup({ debug: false });
    t.customer.rows.delete(EMAIL);
    const res = await t.service.requestReset({ email: EMAIL });
    expect(res.debug).toBeUndefined();
  });
});

// ============================================================ reset

describe('resetting with the code', () => {
  it('sets the new password, signs them in, and emails a "password changed" notice', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    const res = await t.service.resetPassword({ email: EMAIL, code: t.lastCode(), password: 'brand-new-pass' });

    const row = t.customer.rows.get(EMAIL);
    expect(await bcrypt.compare('brand-new-pass', row.password)).toBe(true);
    expect(row.passwordReset).toBeUndefined();
    expect(row.passwordChangedAt).toBeInstanceOf(Date);

    const claims = jwt.verify(res.token, env.jwtSecret);
    expect(claims).toMatchObject({ id: 'c1', email: EMAIL, role: 'customer' });
    expect(t.sent.at(-1).subject).toBe('Your ElectrOnia password was changed');
  });

  it('a code works once', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    const code = t.lastCode();
    await t.service.resetPassword({ email: EMAIL, code, password: 'brand-new-pass' });

    await expect(
      t.service.resetPassword({ email: EMAIL, code, password: 'attacker-pass' })
    ).rejects.toMatchObject({ code: 'RESET_CODE_INVALID' });
    expect(await bcrypt.compare('brand-new-pass', t.customer.rows.get(EMAIL).password)).toBe(true);
  });

  it('two requests racing with the same code: exactly one wins', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    const code = t.lastCode();

    const results = await Promise.allSettled([
      t.service.resetPassword({ email: EMAIL, code, password: 'first-password' }),
      t.service.resetPassword({ email: EMAIL, code, password: 'second-password' }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected').reason.code).toMatch(/RESET_CODE_(USED|INVALID)/);
  });

  it('expires after 15 minutes', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    t.tick(RESET_TTL_MS + 1);

    await expect(
      t.service.resetPassword({ email: EMAIL, code: t.lastCode(), password: 'brand-new-pass' })
    ).rejects.toMatchObject({ code: 'RESET_CODE_INVALID', message: expect.stringMatching(/expired/) });
    expect(t.customer.rows.get(EMAIL).password).toBe('old-hash');
  });

  it('counts down wrong guesses, then locks the code — even the right one stops working', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL });
    const code = t.lastCode();
    const wrong = code === '111111' ? '222222' : '111111';

    const messages = [];
    for (let i = 0; i < RESET_MAX_ATTEMPTS; i += 1) {
      const err = await t.service
        .resetPassword({ email: EMAIL, code: wrong, password: 'brand-new-pass' })
        .catch((e) => e);
      messages.push(err.message);
    }
    expect(messages[0]).toMatch(/4 attempts left/);
    expect(messages[3]).toMatch(/1 attempt left/);
    expect(messages[4]).toMatch(/Request a new code/);

    await expect(
      t.service.resetPassword({ email: EMAIL, code, password: 'brand-new-pass' })
    ).rejects.toMatchObject({ code: 'RESET_CODE_INVALID' });
    expect(t.customer.rows.get(EMAIL).password).toBe('old-hash');
  });

  it('no code requested → the same generic error, no hint that the account exists', async () => {
    const t = setup();
    const a = await t.service.resetPassword({ email: EMAIL, code: '123456', password: 'x'.repeat(8) }).catch((e) => e);
    const b = await t.service.resetPassword({ email: 'nobody@example.com', code: '123456', password: 'x'.repeat(8) }).catch((e) => e);
    expect(a.message).toBe(b.message);
    expect(a.code).toBe('RESET_CODE_INVALID');
  });

  it('customer and vendor accounts with the same email are separate', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL, role: 'customer' });
    const customerCode = t.lastCode();

    await expect(
      t.service.resetPassword({ email: EMAIL, role: 'vendor', code: customerCode, password: 'brand-new-pass' })
    ).rejects.toMatchObject({ code: 'RESET_CODE_INVALID' });
    expect(t.vendor.rows.get(EMAIL).password).toBe('vendor-old');
  });

  it('a vendor reset returns a vendor token', async () => {
    const t = setup();
    await t.service.requestReset({ email: EMAIL, role: 'vendor' });
    const res = await t.service.resetPassword({ email: EMAIL, role: 'vendor', code: t.lastCode(), password: 'brand-new-pass' });

    expect(res.token).toBeUndefined();
    expect(jwt.verify(res.vendorToken, env.jwtSecret)).toMatchObject({ id: 'v1', role: 'vendor' });
    expect(t.sent[0].subject).toMatch(/reset code/);
    expect(t.sent[0].text).toMatch(/vendor account/);
  });
});

// ============================================================ edge

describe('validation', () => {
  const ok = { email: 'A@Example.com ', code: '123456', password: 'longenough' };

  it('normalises the email and defaults role to customer', () => {
    expect(resetPasswordSchema.body.parse(ok)).toEqual({ ...ok, email: 'a@example.com', role: 'customer' });
    expect(forgotPasswordSchema.body.parse({ email: 'x@y.in' }).role).toBe('customer');
  });

  it.each([
    ['short password', { ...ok, password: 'short' }],
    ['5-digit code', { ...ok, code: '12345' }],
    ['letters in code', { ...ok, code: '12a456' }],
    ['admin role', { ...ok, role: 'admin' }],
  ])('rejects %s', (_label, body) => {
    expect(resetPasswordSchema.body.safeParse(body).success).toBe(false);
  });

  it('the HTTP routes validate before touching the database', async () => {
    const app = createApp();
    const a = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'not-an-email' });
    const b = await request(app).post('/api/v1/auth/password/reset').send({ ...ok, password: 'short' });
    expect(a.status).toBe(422);
    expect(b.status).toBe(422);
    expect(b.body.error.details[0].field).toBe('password');
  });
});

describe('emails', () => {
  it('the code email has the code and no link', () => {
    const mail = templates.passwordResetCode({ code: '482913', name: 'Shravani', minutes: 15 });
    expect(mail.subject).toMatch(/^482913 /);
    expect(mail.html).toContain('482913');
    expect(mail.html).not.toMatch(/<a /);
    expect(mail.text).toMatch(/15 minutes/);
  });

  it('the changed notice escapes the name and links to the right sign-in page', () => {
    const mail = templates.passwordChanged({ name: '<b>x</b>', role: 'vendor', appUrl: 'https://shop.in', at: new Date('2026-09-19T10:00:00Z') });
    expect(mail.html).not.toContain('<b>x</b>');
    expect(mail.html).toContain('https://shop.in/loginvendor');
    expect(mail.text).toMatch(/19 Sept 2026|19-Sep-2026|Sep 19, 2026/);
  });
});
