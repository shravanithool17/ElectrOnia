import request from 'supertest';
import { createApp } from '../../server.js';
import Product from '../../model/product.model.js';
import Coupon from '../../model/coupon.model.js';
import { COUPONS } from '../../lib/coupons.data.js';
import * as f from '../factories.js';

const app = createApp();

const auth = (token) => ({ Authorization: `Bearer ${token}` });

describe('server-side cart', () => {
  it('starts empty and priced at zero', async () => {
    const { token } = f.customerToken();

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    expect(res.body.items).toEqual([]);
    expect(res.body.summary.grandTotal.amount).toBe(0);
    expect(res.body.summary.shippingTotal.amount).toBe(0);
  });

  it('adds an item and prices it from the database', async () => {
    const product = await f.product({ price: 250000, stock: 10 });
    const { token } = f.customerToken();

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 2 })
      .expect(201);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unitPrice).toBe(250000);
    expect(res.body.summary.itemsSubtotal.amount).toBe(500000);
    // 18% GST, free delivery over ₹5,000.
    expect(res.body.summary.taxTotal.amount).toBe(90000);
    expect(res.body.summary.shippingTotal.amount).toBe(0);
  });

  it('persists across requests — this is the point of a server cart', async () => {
    const product = await f.product();
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 })
      .expect(201);

    // A different request, as the same user: the cart is still there.
    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);
    expect(res.body.items).toHaveLength(1);
  });

  it('keeps carts separate per user', async () => {
    const product = await f.product();
    const a = f.customerToken();
    const b = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(a.token))
      .send({ productId: product._id, quantity: 1 });

    const res = await request(app).get('/api/v1/cart').set(auth(b.token)).expect(200);
    expect(res.body.items).toEqual([]);
  });

  it('adding the same product again accumulates rather than duplicating', async () => {
    const product = await f.product({ stock: 10 });
    const { token } = f.customerToken();

    for (const quantity of [1, 2]) {
      await request(app)
        .post('/api/v1/cart/items')
        .set(auth(token))
        .send({ productId: product._id, quantity });
    }

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].quantity).toBe(3);
  });

  it('caps the quantity at available stock instead of erroring', async () => {
    const product = await f.product({ stock: 3 });
    const { token } = f.customerToken();

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 10 })
      .expect(201);

    expect(res.body.items[0].quantity).toBe(3);
  });

  it('refuses to add an out-of-stock product', async () => {
    const product = await f.product({ stock: 0 });
    const { token } = f.customerToken();

    const res = await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 })
      .expect(409);

    expect(res.body.error.code).toBe('OUT_OF_STOCK');
  });

  it('rejects a quantity above the per-line cap at validation', async () => {
    const product = await f.product({ stock: 100 });
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 999 })
      .expect(422);
  });
});

describe('cart — price and stock changes', () => {
  it('reports a price rise as a notice and charges the new price', async () => {
    const product = await f.product({ price: 100000, stock: 5 });
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 });

    await Product.updateOne({ _id: product._id }, { price: 120000 });

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    expect(res.body.items[0].unitPrice).toBe(120000);
    expect(res.body.items[0].priceChanged).toMatchObject({ from: 100000, to: 120000, direction: 'up' });
    expect(res.body.notices.map((n) => n.code)).toContain('PRICE_INCREASED');
  });

  it('applies a price drop silently — no notice needed for good news', async () => {
    const product = await f.product({ price: 100000, stock: 5 });
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 });

    await Product.updateOne({ _id: product._id }, { price: 80000 });

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    expect(res.body.items[0].unitPrice).toBe(80000);
    expect(res.body.notices.map((n) => n.code)).not.toContain('PRICE_INCREASED');
  });

  it('flags a product that went out of stock but keeps it in the cart', async () => {
    const product = await f.product({ stock: 5 });
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 2 });

    await Product.updateOne({ _id: product._id }, { stock: 0 });

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    // Kept and flagged, not silently deleted.
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unavailable).toBe(true);
    // And excluded from the total.
    expect(res.body.summary.itemsSubtotal.amount).toBe(0);
  });

  it('reduces a quantity that now exceeds stock, and says so', async () => {
    const product = await f.product({ stock: 10 });
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 8 });

    await Product.updateOne({ _id: product._id }, { stock: 3 });

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    expect(res.body.items[0].quantity).toBe(3);
    expect(res.body.notices.map((n) => n.code)).toContain('QUANTITY_REDUCED');
  });

  it('keeps a delisted product visible rather than erasing it', async () => {
    const product = await f.product();
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 });

    await Product.deleteOne({ _id: product._id });

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].unavailable).toBe(true);
    expect(res.body.notices.map((n) => n.code)).toContain('PRODUCT_UNAVAILABLE');
  });
});

describe('cart — save for later', () => {
  it('moves a line out of the total but keeps it in the cart', async () => {
    const product = await f.product({ price: 100000, stock: 5 });
    const { token } = f.customerToken();

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 });

    const res = await request(app)
      .post(`/api/v1/cart/items/${product._id}/save-for-later`)
      .set(auth(token))
      .expect(200);

    expect(res.body.items).toHaveLength(0);
    expect(res.body.savedForLater).toHaveLength(1);
    expect(res.body.summary.itemsSubtotal.amount).toBe(0);
  });

  it('toggles back into the cart', async () => {
    const product = await f.product({ stock: 5 });
    const { token } = f.customerToken();

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    await request(app).post(`/api/v1/cart/items/${product._id}/save-for-later`).set(auth(token));

    const res = await request(app)
      .post(`/api/v1/cart/items/${product._id}/save-for-later`)
      .set(auth(token))
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(res.body.savedForLater).toHaveLength(0);
  });
});

describe('cart — coupons', () => {
  beforeEach(async () => {
    await Coupon.insertMany(COUPONS);
  });

  it('applies a valid coupon', async () => {
    const product = await f.product({ price: 500000, stock: 5 });
    const { token } = f.customerToken();

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });

    const res = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(token))
      .send({ code: 'welcome10' }) // lower-case on purpose — it is normalised
      .expect(200);

    expect(res.body.summary.appliedCoupon).toBe('WELCOME10');
    expect(res.body.summary.discountTotal.amount).toBe(50000);
  });

  it('rejects an unknown code with a reason', async () => {
    const { token } = f.customerToken();

    const res = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(token))
      .send({ code: 'NOPE123' })
      .expect(422);

    expect(res.body.error.message).toMatch(/does not exist/i);
  });

  it('refuses a coupon whose minimum the cart does not meet, and says the amount', async () => {
    const product = await f.product({ price: 50000, stock: 5 }); // ₹500
    const { token } = f.customerToken();

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });

    const res = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(token))
      .send({ code: 'WELCOME10' })
      .expect(422);

    expect(res.body.error.message).toMatch(/₹1,000/);
  });

  it('removes an applied coupon', async () => {
    const product = await f.product({ price: 500000, stock: 5 });
    const { token } = f.customerToken();

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    await request(app).post('/api/v1/cart/coupon').set(auth(token)).send({ code: 'WELCOME10' });

    const res = await request(app).delete('/api/v1/cart/coupon').set(auth(token)).expect(200);

    expect(res.body.summary.discountTotal.amount).toBe(0);
    expect(res.body.couponCode).toBeNull();
  });

  it('drops a coupon that became invalid, with a notice', async () => {
    const product = await f.product({ price: 500000, stock: 5 });
    const { token } = f.customerToken();

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    await request(app).post('/api/v1/cart/coupon').set(auth(token)).send({ code: 'WELCOME10' });

    await Coupon.updateOne({ code: 'WELCOME10' }, { isActive: false });

    const res = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);

    expect(res.body.couponCode).toBeNull();
    expect(res.body.notices.map((n) => n.code)).toContain('COUPON_INVALID');
  });
});

describe('cart — guests and merging', () => {
  it('gives an anonymous visitor a cart via an httpOnly cookie', async () => {
    const product = await f.product({ stock: 5 });

    const res = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product._id, quantity: 1 })
      .expect(201);

    const cookie = res.headers['set-cookie']?.find((c) => c.startsWith('cartToken='));
    expect(cookie).toBeDefined();
    expect(cookie).toMatch(/HttpOnly/i);
    expect(res.body.items).toHaveLength(1);
  });

  it('merges a guest cart into the user cart on login, summing quantities', async () => {
    const product = await f.product({ stock: 20 });
    const { token } = f.customerToken();

    // Guest adds 2.
    const guestRes = await request(app)
      .post('/api/v1/cart/items')
      .send({ productId: product._id, quantity: 2 })
      .expect(201);
    const guestToken = guestRes.headers['set-cookie']
      .find((c) => c.startsWith('cartToken='))
      .split('=')[1]
      .split(';')[0];

    // The same person, signed in, already had 1.
    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 1 });

    const merged = await request(app)
      .post('/api/v1/cart/merge')
      .set(auth(token))
      .send({ guestToken })
      .expect(200);

    expect(merged.body.items).toHaveLength(1);
    expect(merged.body.items[0].quantity).toBe(3);

    // The guest cart is gone, so it cannot be merged twice.
    const again = await request(app)
      .post('/api/v1/cart/merge')
      .set(auth(token))
      .send({ guestToken })
      .expect(200);
    expect(again.body.items[0].quantity).toBe(3);
  });

  it('will not let a vendor token merge into a cart', async () => {
    const { token } = f.vendorToken();
    await request(app)
      .post('/api/v1/cart/merge')
      .set(auth(token))
      .send({ guestToken: 'x'.repeat(32) })
      .expect(403);
  });
});
