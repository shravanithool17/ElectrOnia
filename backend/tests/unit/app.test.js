import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../server.js';
import { signToken } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { toPaise, formatINR, lineTotal, percentOf, sum } from '../../lib/money.js';

// No database needed: every path here is rejected by validation, auth or the
// 404 handler before a query is ever issued. That is deliberate — it means
// these run anywhere, including a CI box with no Mongo binary.
const app = createApp();

describe('token handling', () => {
  it('rejects a token with no role claim', async () => {
    // Exactly the shape issued before roles existed.
    const legacy = jwt.sign({ id: '507f1f77bcf86cd799439011', email: 'a@b.com' }, env.jwtSecret);

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${legacy}`)
      .expect(401);

    expect(res.body.error.code).toBe('LEGACY_TOKEN');
  });

  it('rejects a token signed with the wrong secret', async () => {
    const forged = jwt.sign({ id: '1', role: 'admin' }, 'not-the-real-secret');

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);

    expect(res.body.error.code).toBe('INVALID_TOKEN');
  });

  it('rejects an expired token with a distinguishable code', async () => {
    const expired = jwt.sign({ id: '1', role: 'customer' }, env.jwtSecret, { expiresIn: '-1s' });

    const res = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${expired}`)
      .expect(401);

    expect(res.body.error.code).toBe('TOKEN_EXPIRED');
  });

  it('rejects a request with no token at all', async () => {
    const res = await request(app).get('/api/v1/auth/me').expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });

  it('refuses to sign a token without a role', () => {
    expect(() => signToken({ id: '1', email: 'a@b.com' })).toThrow(/role claim is required/);
  });
});

describe('role-based access control', () => {
  const vendorRoute = { method: 'post', path: '/api/v1/products' };

  it('rejects a customer token on a vendor route with 403', async () => {
    const token = signToken({ id: '507f1f77bcf86cd799439011', role: 'customer', name: 'C' });

    const res = await request(app)[vendorRoute.method](vendorRoute.path)
      .set('Authorization', `Bearer ${token}`)
      .send({
        title: 'A New Laptop',
        description: 'Ten characters or more of description.',
        price: 149900,
        category: 'Laptops',
        brand: 'TestBrand',
      })
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_REQUIRED');
  });

  it('rejects a vendor token on a customer route with 403', async () => {
    const token = signToken({ id: '507f1f77bcf86cd799439011', role: 'vendor', name: 'V' });

    await request(app)
      .get('/api/v1/orders/mine')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);
  });

  it('authorises before validating, so an anonymous caller learns nothing about the schema', async () => {
    // Garbage body, no token: the 401 must win over the 422.
    const res = await request(app).post('/api/v1/products').send({ nonsense: true }).expect(401);
    expect(res.body.error.code).toBe('UNAUTHORIZED');
  });
});

describe('validation', () => {
  it('rejects a short password with field-level detail', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customers/register')
      .send({
        name: 'Test Person',
        email: 'signup@example.com',
        password: 'short',
        address: '1 Test Street, Pune',
        phone: '9999999999',
      })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
    expect(res.body.error.details).toEqual(
      expect.arrayContaining([expect.objectContaining({ field: 'password' })])
    );
  });

  it('rejects a malformed email', async () => {
    const res = await request(app)
      .post('/api/v1/auth/customers/register')
      .send({
        name: 'Test Person',
        email: 'not-an-email',
        password: 'correct-horse-battery',
        address: '1 Test Street, Pune',
        phone: '9999999999',
      })
      .expect(422);

    expect(res.body.error.details[0].field).toBe('email');
  });

  it('rejects a non-numeric verification code before it reaches the store', async () => {
    await request(app)
      .post('/api/v1/auth/verify-otp')
      .send({ email: 'a@b.com', otp: 'abcdef' })
      .expect(422);
  });

  it('rejects an unknown sort value rather than silently ignoring it', async () => {
    const res = await request(app).get('/api/v1/products?sort=cheapest').expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects an invalid ObjectId with 422, not a 500 cast error', async () => {
    const res = await request(app).get('/api/v1/products/not-an-id').expect(422);
    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('strips MongoDB operator keys from a body', async () => {
    // { $gt: '' } as a password is the classic operator-injection attempt.
    // sanitize() removes the key, so zod then sees a missing password.
    const res = await request(app)
      .post('/api/v1/auth/customers/login')
      .send({ email: 'someone@example.com', password: { $gt: '' } })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a PATCH with an empty body instead of no-oping', async () => {
    const token = signToken({ id: '507f1f77bcf86cd799439011', role: 'vendor', name: 'V' });

    await request(app)
      .patch('/api/v1/products/507f1f77bcf86cd799439011')
      .set('Authorization', `Bearer ${token}`)
      .send({})
      .expect(422);
  });
});

describe('plumbing', () => {
  it('returns an X-Request-Id header and echoes it in the error body', async () => {
    const res = await request(app).get('/api/v1/nope').expect(404);

    expect(res.headers['x-request-id']).toBeDefined();
    expect(res.body.requestId).toBe(res.headers['x-request-id']);
    expect(res.body.error.code).toBe('ROUTE_NOT_FOUND');
  });

  it('propagates a caller-supplied request id', async () => {
    const res = await request(app)
      .get('/api/v1/nope')
      .set('X-Request-Id', 'trace-me-123')
      .expect(404);

    expect(res.headers['x-request-id']).toBe('trace-me-123');
  });

  it('answers liveness without touching the database', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('sets security headers', async () => {
    const res = await request(app).get('/health').expect(200);
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['x-powered-by']).toBeUndefined();
  });

  it('mounts the legacy unversioned paths alongside /v1', async () => {
    // Both must reach the same handler — the frontend still calls the old one.
    await request(app).post('/logincustomer').send({}).expect(422);
    await request(app).post('/api/v1/auth/customers/login').send({}).expect(422);
  });
});

describe('money', () => {
  it('converts rupees to paise', () => {
    expect(toPaise(2499)).toBe(249900);
    expect(toPaise('1499.50')).toBe(149950);
  });

  it('has no floating point error — the reason the convention exists', () => {
    expect(toPaise(0.1) + toPaise(0.2)).toBe(toPaise(0.3));
    expect(0.1 + 0.2).not.toBe(0.3); // for contrast
  });

  it('formats as Indian rupees', () => {
    expect(formatINR(249900)).toBe('\u20b92,499.00');
    expect(formatINR(0)).toBe('\u20b90.00');
    expect(formatINR(100000000)).toBe('\u20b910,00,000.00'); // lakh grouping
  });

  it('multiplies exactly', () => {
    expect(lineTotal(33333, 3)).toBe(99999);
    expect(sum([100, 200, 300])).toBe(600);
  });

  it('rounds a percentage half-up, once', () => {
    expect(percentOf(249900, 8)).toBe(19992);
    expect(percentOf(101, 50)).toBe(51); // 50.5 → 51
  });

  it('refuses a non-integer amount rather than silently truncating', () => {
    expect(() => lineTotal(2499.5, 1)).toThrow(/integer number of paise/);
    expect(() => formatINR(-1)).toThrow(/cannot be negative/);
  });
});

describe('vendor dashboard access', () => {
  it('requires a token', async () => {
    await request(app).get('/api/v1/vendor/dashboard').expect(401);
  });

  it('rejects a customer token — revenue is vendor-scoped', async () => {
    const token = signToken({ id: '507f1f77bcf86cd799439011', role: 'customer', name: 'C' });

    const res = await request(app)
      .get('/api/v1/vendor/dashboard')
      .set('Authorization', `Bearer ${token}`)
      .expect(403);

    expect(res.body.error.code).toBe('ROLE_REQUIRED');
  });
});

describe('seed catalogue data', () => {
  it('is internally consistent — every row valid for the Product schema', async () => {
    const { CATALOGUE, CATALOGUE_STATS } = await import('../../lib/catalogue.data.js');
    const CATEGORIES = ['Laptops', 'Smartphones', 'Audio', 'Wearables', 'Gaming', 'Accessories'];

    expect(CATALOGUE.length).toBeGreaterThanOrEqual(60);
    expect(CATALOGUE_STATS.categories).toBe(6);

    for (const product of CATALOGUE) {
      // Money must be integer paise — a float here would fail the schema
      // validator at insert time, after the collection was already wiped.
      expect(Number.isInteger(product.price)).toBe(true);
      expect(Number.isInteger(product.originalPrice)).toBe(true);
      expect(product.price).toBeGreaterThan(0);
      // MRP is never below the selling price, or the card shows a negative discount.
      expect(product.originalPrice).toBeGreaterThanOrEqual(product.price);

      expect(CATEGORIES).toContain(product.category);
      expect(product.title.length).toBeGreaterThan(2);
      expect(product.description.length).toBeGreaterThanOrEqual(10);
      expect(product.brand).toBeTruthy();
      expect(Number.isInteger(product.stock)).toBe(true);
      expect(product.stock).toBeGreaterThanOrEqual(0);
      expect(product.rating).toBeGreaterThanOrEqual(0);
      expect(product.rating).toBeLessThanOrEqual(5);
      // Generated art is stored as a path relative to the API origin; a
      // vendor's own photography is absolute. Both are valid.
      expect(product.images[0]).toMatch(/^(?:https:\/\/|\/media\/)/);
      expect(Object.keys(product.specifications).length).toBeGreaterThan(0);
    }
  });

  it('has no duplicate titles', async () => {
    const { CATALOGUE } = await import('../../lib/catalogue.data.js');
    const titles = CATALOGUE.map((p) => p.title);
    expect(new Set(titles).size).toBe(titles.length);
  });

  it('covers the states the UI has to render', async () => {
    const { CATALOGUE_STATS } = await import('../../lib/catalogue.data.js');
    // Without these the sold-out overlay, low-stock badge and featured rail
    // are never exercised by a demo.
    expect(CATALOGUE_STATS.outOfStock).toBeGreaterThan(0);
    expect(CATALOGUE_STATS.lowStock).toBeGreaterThan(0);
    expect(CATALOGUE_STATS.featured).toBeGreaterThan(4);
  });

  it('prices are plausible Indian retail, not dollar figures', async () => {
    const { CATALOGUE } = await import('../../lib/catalogue.data.js');
    const macbook = CATALOGUE.find((p) => p.title.includes('MacBook Pro'));
    // The old seed had 2499 (a USD price) rendered as ₹2,499.
    expect(macbook.price).toBeGreaterThan(100_000_00);
  });
});
