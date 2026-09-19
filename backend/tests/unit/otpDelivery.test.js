// tests/unit/otpDelivery.test.js
//
// The bug these pin down was not a crash. SMTP credentials were added to
// .env, nodemon did not restart (it does not watch .env), so the process still
// had no credentials — and the API answered "Verification code sent to your
// email" while printing the code to its own console. Successful response, no
// email, no error anywhere.
//
// So: the response must say where the code actually went, and a production
// server that cannot send must fail instead of pretending.
import request from 'supertest';

import { createApp } from '../../server.js';
import { env } from '../../config/env.js';

const app = createApp();

// These tests run with no SMTP configured, which is exactly the state that
// caused the confusion.
describe('POST /send-otp with email not configured', () => {
  it('says the code went to the console, not to the inbox', async () => {
    const res = await request(app).post('/send-otp').send({ email: 'someone@example.com' });

    // It still succeeds — offline development is a supported path.
    expect(res.status).toBe(200);
    // But it does not claim an email was sent.
    expect(res.body.emailed).toBe(false);
    expect(res.body.deliveredTo).toBe('console');
    expect(res.body.message).toMatch(/console/i);
    expect(res.body.message).not.toMatch(/sent to your email/i);
  });

  it('answers the same way on the vendor route', async () => {
    const res = await request(app).post('/sendvendorotp').send({ email: 'vendor@example.com' });

    expect(res.status).toBe(200);
    expect(res.body.emailed).toBe(false);
    expect(res.body.message).toMatch(/console/i);
  });

  it('is not configured in this environment, which is what makes the above true', () => {
    // Guards the premise: if SMTP ever becomes configured in the test env,
    // the assertions above would be testing the wrong branch.
    expect(env.smtp.enabled).toBe(false);
  });
});

describe('the vendor OTP verification route exists', () => {
  it('/verify-otp-vendor is mounted, not a 404', async () => {
    // The vendor signup screen posts here. The route was missing, so vendor
    // signup died on a 404 that the UI rendered as an empty error.
    const res = await request(app)
      .post('/verify-otp-vendor')
      .send({ email: 'vendor@example.com', otp: '123456' });

    expect(res.status).not.toBe(404);
    // No code was issued for this address, so a 4xx about the code is the
    // correct answer — it proves the handler ran.
    expect(res.body.error.code).toBe('OTP_INVALID');
  });

  it('behaves identically to /verify-otp, because it is the same handler', async () => {
    const vendor = await request(app)
      .post('/verify-otp-vendor')
      .send({ email: 'x@example.com', otp: '123456' });
    const customer = await request(app)
      .post('/verify-otp')
      .send({ email: 'x@example.com', otp: '123456' });

    expect(vendor.status).toBe(customer.status);
    expect(vendor.body.error.code).toBe(customer.body.error.code);
  });
});

describe('the error shape the frontend reads', () => {
  it('nests code and message under `error`, which is why data.message was blank', async () => {
    // Both signup screens used to read `data.message` off the raw response.
    // This asserts the shape they have to read instead, so a future rewrite
    // that reintroduces the flat assumption fails here.
    const res = await request(app).post('/send-otp').send({ email: 'not-an-email' });

    // 422 — the zod layer rejected the body before the handler ran.
    expect(res.status).toBe(422);
    expect(res.body.message).toBeUndefined();
    expect(res.body.error).toEqual(
      expect.objectContaining({ code: expect.any(String), message: expect.any(String) })
    );
    expect(res.body.requestId).toBeDefined();
  });
});
