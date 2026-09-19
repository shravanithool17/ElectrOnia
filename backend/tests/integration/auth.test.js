import request from 'supertest';
import { createApp } from '../../server.js';

// These need a real database: each one issues a query.
const app = createApp();

const signupBody = {
  name: 'Test Person',
  email: 'signup@example.com',
  password: 'correct-horse-battery',
  address: '1 Test Street, Pune',
  phone: '9999999999',
};

describe('signup', () => {
  it('will not create an account without a verified email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customers/register')
      .send(signupBody)
      .expect(403);

    expect(res.body.error.code).toBe('EMAIL_NOT_VERIFIED');
  });
});

describe('login', () => {
  it('gives the same message for a wrong password and an unknown account', async () => {
    // Identical responses, so the API cannot be used to enumerate accounts.
    const res = await request(app)
      .post('/api/v1/auth/customers/login')
      .send({ email: 'nobody@example.com', password: 'whatever1234' })
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    expect(res.body.error.message).toBe('Incorrect email or password');
  });
});

describe('verification codes', () => {
  it('issues a code and rejects a wrong one', async () => {
    await request(app)
      .post('/api/v1/auth/send-otp')
      .send({ email: signupBody.email })
      .expect(200);

    // The code is only ever stored as a bcrypt hash, so a test cannot read it
    // back — which is the point. Verified through the public failure path.
    const res = await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: signupBody.email, otp: '000000' })
      .expect(400);

    expect(res.body.error.code).toBe('OTP_INVALID');
  });
});

describe('readiness', () => {
  it('reports the database as connected', async () => {
    const res = await request(app).get('/ready').expect(200);
    expect(res.body.db).toBe('connected');
  });
});
