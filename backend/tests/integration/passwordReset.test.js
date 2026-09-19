// tests/integration/passwordReset.test.js — the real Mongo queries behind
// forgot password. The unit tests use a fake repo; these check that the
// conditional updates in auth.repo.js actually mean what the fake assumes.
import bcrypt from 'bcrypt';
import request from 'supertest';

import { createApp } from '../../server.js';
import Customer from '../../model/user.model.js';
import { customerRepo } from '../../modules/auth/auth.repo.js';

const app = createApp();
const EMAIL = 'reset@example.com';

async function makeCustomer() {
  return Customer.create({
    name: 'Reset Person',
    email: EMAIL,
    password: await bcrypt.hash('old-password', 4),
    address: '1 Test Street, Pune',
    phone: '9999999999',
  });
}

async function plantCode(id, code, { requestedAt = new Date(), expiresAt } = {}) {
  const reset = {
    hash: await bcrypt.hash(code, 4),
    expiresAt: expiresAt ?? new Date(Date.now() + 15 * 60 * 1000),
    attempts: 0,
    requestedAt,
  };
  await Customer.updateOne({ _id: id }, { $set: { passwordReset: reset } });
  return reset;
}

describe('forgot password against MongoDB', () => {
  it('stores the reset hidden from ordinary reads', async () => {
    const c = await makeCustomer();
    await request(app).post('/api/v1/auth/password/forgot').send({ email: EMAIL }).expect(200);

    const plain = await Customer.findById(c._id).lean();
    expect(plain.passwordReset).toBeUndefined();
    const withReset = await Customer.findById(c._id).select('+passwordReset').lean();
    expect(withReset.passwordReset.hash).toMatch(/^\$2/);
    expect(withReset.passwordReset.attempts).toBe(0);
  });

  it('startReset respects the cooldown', async () => {
    const c = await makeCustomer();
    const first = await plantCode(c._id, '111111');
    const again = await customerRepo.startReset(c._id, { ...first, hash: 'x' }, new Date(Date.now() - 60_000));
    expect(again.modifiedCount).toBe(0);

    const later = await customerRepo.startReset(c._id, { ...first, hash: 'x' }, new Date(Date.now() + 1000));
    expect(later.modifiedCount).toBe(1);
  });

  it('startReset works on an account that never had a reset', async () => {
    const c = await makeCustomer();
    const res = await customerRepo.startReset(
      c._id,
      { hash: 'h', expiresAt: new Date(Date.now() + 1000), attempts: 0, requestedAt: new Date() },
      new Date()
    );
    expect(res.modifiedCount).toBe(1);
  });

  it('full reset over HTTP: new password works, old one does not, code is spent', async () => {
    const c = await makeCustomer();
    await plantCode(c._id, '482913');

    const res = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: EMAIL, code: '482913', password: 'new-password-1' })
      .expect(200);
    expect(res.body.token).toEqual(expect.any(String));

    await request(app).post('/api/v1/auth/customers/login').send({ email: EMAIL, password: 'old-password' }).expect(401);
    await request(app).post('/api/v1/auth/customers/login').send({ email: EMAIL, password: 'new-password-1' }).expect(200);

    const again = await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: EMAIL, code: '482913', password: 'another-pass' })
      .expect(400);
    expect(again.body.error.code).toBe('RESET_CODE_INVALID');

    const row = await Customer.findById(c._id).select('+passwordReset').lean();
    expect(row.passwordReset).toBeUndefined();
    expect(row.passwordChangedAt).toBeInstanceOf(Date);
  });

  it('wrong guesses are counted in the database and lock the code at 5', async () => {
    const c = await makeCustomer();
    await plantCode(c._id, '482913');

    for (let i = 0; i < 5; i += 1) {
      await request(app)
        .post('/api/v1/auth/password/reset')
        .send({ email: EMAIL, code: '000000', password: 'new-password-1' })
        .expect(400);
    }
    await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: EMAIL, code: '482913', password: 'new-password-1' })
      .expect(400);
  });

  it('an expired code is refused', async () => {
    const c = await makeCustomer();
    await plantCode(c._id, '482913', { expiresAt: new Date(Date.now() - 1000) });
    await request(app)
      .post('/api/v1/auth/password/reset')
      .send({ email: EMAIL, code: '482913', password: 'new-password-1' })
      .expect(400);
  });

  it('an unknown email gets the same 200 as a known one', async () => {
    await makeCustomer();
    const known = await request(app).post('/api/v1/auth/password/forgot').send({ email: EMAIL });
    const unknown = await request(app).post('/api/v1/auth/password/forgot').send({ email: 'nobody@example.com' });
    expect(unknown.status).toBe(200);
    expect(unknown.body).toEqual(known.body);
  });
});
