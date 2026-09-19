// tests/unit/cartConsistency.test.js
//
// "The drawer shows products, checkout says the cart is empty."
//
// That symptom had three independent causes. Each is pinned here at the layer
// where it was fixed:
//
//   1. A dead token (expired, or signed with a JWT_SECRET that has since
//      changed) silently became a guest on the cart, but a 401 on checkout.
//      → optionalAuth now reports it in X-Auth-Status, and CORS exposes that
//        header so the browser can actually read it.
//
//   2. `npm run seed -- --force` deleted and reinserted every product, which
//      gave each one a new _id and orphaned every cart line in the database.
//      → --force now upserts in place; only --wipe deletes.
//
//   3. Checkout answered "Your cart is empty" whether the cart was empty, all
//      saved for later, or all unavailable.
//      → each case has its own error code.
//
// The frontend half (signup merging the guest cart, the cart refetching on
// any identity change) is browser behaviour and was verified end to end
// against the real frontend build.
import { jest } from '@jest/globals';
import request from 'supertest';
import jwt from 'jsonwebtoken';

import { createApp } from '../../server.js';
import { env } from '../../config/env.js';
import { optionalAuth } from '../../middleware/auth.js';
import { parseArgs, seedCatalogue } from '../../lib/seed.js';
import Product from '../../model/product.model.js';
import { cartService } from '../../modules/cart/cart.service.js';
import { checkoutService } from '../../modules/checkout/checkout.service.js';

const app = createApp();

// ---------------------------------------------------------------- helpers

function run(middleware, headers = {}) {
  const set = {};
  const req = { headers, get: (name) => headers[name.toLowerCase()] };
  const res = {
    set: (key, value) => {
      set[key] = value;
      return res;
    },
  };
  let nextCalledWith = 'not called';
  middleware(req, res, (arg) => {
    nextCalledWith = arg;
  });
  return { req, set, nextCalledWith };
}

const bearer = (token) => ({ authorization: `Bearer ${token}` });
const sign = (payload, secret = env.jwtSecret, options = {}) => jwt.sign(payload, secret, options);

// ------------------------------------------------------ 1. dead tokens

describe('optionalAuth — a token that is sent but rejected is not the same as no token', () => {
  it('lets a guest through with no header when no token was sent', () => {
    const { req, set, nextCalledWith } = run(optionalAuth);
    expect(req.user).toBeUndefined();
    expect(set['X-Auth-Status']).toBeUndefined();
    expect(nextCalledWith).toBeUndefined();
  });

  it('identifies a valid token and sets no header', () => {
    const token = sign({ id: 'u1', email: 'a@b.in', name: 'A', role: 'customer' });
    const { req, set } = run(optionalAuth, bearer(token));
    expect(req.user).toEqual(expect.objectContaining({ id: 'u1', role: 'customer' }));
    expect(set['X-Auth-Status']).toBeUndefined();
  });

  it('reports a token signed with a DIFFERENT secret — what changing JWT_SECRET does', () => {
    const token = sign({ id: 'u1', role: 'customer' }, 'an-old-secret-that-is-at-least-32-chars');
    const { req, set, nextCalledWith } = run(optionalAuth, bearer(token));

    // Still proceeds as a guest, so browsing never breaks...
    expect(req.user).toBeUndefined();
    expect(nextCalledWith).toBeUndefined();
    // ...but no longer silently.
    expect(set['X-Auth-Status']).toBe('invalid');
  });

  it('reports an expired token as expired', () => {
    const token = sign({ id: 'u1', role: 'customer' }, env.jwtSecret, { expiresIn: -10 });
    const { set } = run(optionalAuth, bearer(token));
    expect(set['X-Auth-Status']).toBe('expired');
  });

  it('reports a pre-roles token as legacy', () => {
    const token = sign({ id: 'u1', email: 'a@b.in' });
    const { req, set } = run(optionalAuth, bearer(token));
    expect(req.user).toBeUndefined();
    expect(set['X-Auth-Status']).toBe('legacy');
  });

  it('reports garbage as invalid', () => {
    const { set } = run(optionalAuth, bearer('not-a-jwt'));
    expect(set['X-Auth-Status']).toBe('invalid');
  });
});

describe('CORS exposes X-Auth-Status', () => {
  it('lists it in Access-Control-Expose-Headers, or the browser can never read it', async () => {
    // Without this, the server sets the header and fetch() in the browser
    // returns null for it — the fix would exist and do nothing.
    const res = await request(app).get('/health').set('Origin', 'http://localhost:5173');
    expect(res.headers['access-control-expose-headers']).toMatch(/X-Auth-Status/i);
  });
});

// ------------------------------------------------------ 2. reseeding

describe('seed flags', () => {
  it('reads --force and --wipe separately', () => {
    expect(parseArgs(['--force'])).toEqual(expect.objectContaining({ force: true, wipe: false }));
    expect(parseArgs(['--wipe'])).toEqual(expect.objectContaining({ force: false, wipe: true }));
    expect(parseArgs([])).toEqual(expect.objectContaining({ force: false, wipe: false }));
  });

  it('rejects a malformed --vendor id rather than seeding orphans', () => {
    expect(() => parseArgs(['--vendor', 'nope'])).toThrow(/ObjectId/);
  });
});

describe('seedCatalogue --force keeps product ids', () => {
  afterEach(() => jest.restoreAllMocks());

  it('upserts by title and NEVER deletes', async () => {
    jest.spyOn(Product, 'countDocuments').mockResolvedValue(127);
    const deleteMany = jest.spyOn(Product, 'deleteMany').mockResolvedValue({ deletedCount: 0 });
    const insertMany = jest.spyOn(Product, 'insertMany').mockResolvedValue([]);
    const bulkWrite = jest
      .spyOn(Product, 'bulkWrite')
      .mockResolvedValue({ upsertedCount: 0, modifiedCount: 127 });

    const result = await seedCatalogue({ force: true });

    // The whole point: nothing that existed gets a new _id.
    expect(deleteMany).not.toHaveBeenCalled();
    expect(insertMany).not.toHaveBeenCalled();

    const ops = bulkWrite.mock.calls[0][0];
    expect(ops.length).toBeGreaterThan(100);
    for (const op of ops) {
      expect(op.updateOne.upsert).toBe(true);
      // Matched on title, so an existing product is updated in place.
      expect(Object.keys(op.updateOne.filter)).toEqual(['title']);
      // The update never touches _id.
      expect(op.updateOne.update.$set._id).toBeUndefined();
    }
    expect(result).toEqual(expect.objectContaining({ deleted: 0, updated: 127 }));
  });

  it('only --wipe deletes', async () => {
    jest.spyOn(Product, 'countDocuments').mockResolvedValue(127);
    const deleteMany = jest.spyOn(Product, 'deleteMany').mockResolvedValue({ deletedCount: 127 });
    jest.spyOn(Product, 'insertMany').mockResolvedValue(new Array(127).fill({}));
    const bulkWrite = jest.spyOn(Product, 'bulkWrite');

    const result = await seedCatalogue({ wipe: true });

    expect(deleteMany).toHaveBeenCalledTimes(1);
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(result.deleted).toBe(127);
  });

  it('does nothing to a non-empty catalogue without a flag', async () => {
    jest.spyOn(Product, 'countDocuments').mockResolvedValue(127);
    const bulkWrite = jest.spyOn(Product, 'bulkWrite');
    const deleteMany = jest.spyOn(Product, 'deleteMany');

    const result = await seedCatalogue({});

    expect(result.skipped).toBe(true);
    expect(bulkWrite).not.toHaveBeenCalled();
    expect(deleteMany).not.toHaveBeenCalled();
  });
});

// ------------------------------------------- 3. why there is nothing to charge

describe('checkout says WHY there is nothing to charge', () => {
  afterEach(() => jest.restoreAllMocks());

  const withCart = (dto) =>
    jest
      .spyOn(cartService, 'getChargeable')
      .mockResolvedValue({ cart: { couponCode: null }, chargeable: [], dto });

  const quoteError = async () => {
    try {
      await checkoutService.quote({ userId: '507f1f77bcf86cd799439011' });
      return null;
    } catch (err) {
      return err;
    }
  };

  it('CART_ONLY_UNAVAILABLE when every line is out of stock or delisted', async () => {
    // Exactly the state a destructive reseed left every cart in.
    withCart({
      items: [
        { productId: 'a', title: 'Unavailable product', unavailable: true },
        { productId: 'b', title: 'Unavailable product', unavailable: true },
      ],
      savedForLater: [],
    });

    const err = await quoteError();
    expect(err.status).toBe(422);
    expect(err.code).toBe('CART_ONLY_UNAVAILABLE');
    expect(err.message).toMatch(/2 items/);
    expect(err.message).not.toMatch(/empty/i);
    expect(err.details).toEqual({ active: 2, saved: 0, unavailable: 2 });
  });

  it('CART_ONLY_SAVED when everything is saved for later', async () => {
    withCart({ items: [], savedForLater: [{ productId: 'a' }, { productId: 'b' }, { productId: 'c' }] });

    const err = await quoteError();
    expect(err.code).toBe('CART_ONLY_SAVED');
    expect(err.message).toMatch(/3 items/);
    expect(err.message).not.toMatch(/empty/i);
  });

  it('CART_EMPTY only when it really is empty', async () => {
    withCart({ items: [], savedForLater: [] });

    const err = await quoteError();
    expect(err.code).toBe('CART_EMPTY');
    expect(err.message).toBe('Your cart is empty.');
  });

  it('prefers "unavailable" over "saved" when both apply — that is the one to act on', async () => {
    withCart({
      items: [{ productId: 'a', unavailable: true }],
      savedForLater: [{ productId: 'b' }],
    });

    const err = await quoteError();
    expect(err.code).toBe('CART_ONLY_UNAVAILABLE');
  });
});
