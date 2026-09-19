import request from 'supertest';
import { createApp } from '../../server.js';
import Product from '../../model/product.model.js';
import Coupon from '../../model/coupon.model.js';
import Address from '../../model/address.model.js';
import CouponRedemption from '../../model/couponRedemption.model.js';
import { COUPONS } from '../../lib/coupons.data.js';
import * as f from '../factories.js';

const app = createApp();
const auth = (token) => ({ Authorization: `Bearer ${token}` });

const ADDRESS = {
  fullName: 'Test Person',
  phone: '9999999999',
  line1: '1 Test Street',
  city: 'Pune',
  state: 'Maharashtra',
  pincode: '411001',
};

async function withAddress(token) {
  const res = await request(app).post('/api/v1/addresses').set(auth(token)).send(ADDRESS).expect(201);
  return res.body.address;
}

describe('address book', () => {
  it('makes the first address the default automatically', async () => {
    const { token } = f.customerToken();

    const res = await request(app).post('/api/v1/addresses').set(auth(token)).send(ADDRESS).expect(201);

    expect(res.body.address.isDefault).toBe(true);
    expect(res.body.address.oneLine).toContain('411001');
  });

  it('keeps exactly one default when another is promoted', async () => {
    const { token } = f.customerToken();
    const first = await withAddress(token);
    const second = await withAddress(token);

    await request(app).post(`/api/v1/addresses/${second._id}/default`).set(auth(token)).expect(200);

    const list = await request(app).get('/api/v1/addresses').set(auth(token)).expect(200);
    const defaults = list.body.items.filter((a) => a.isDefault);

    expect(defaults).toHaveLength(1);
    expect(defaults[0]._id).toBe(second._id);
    expect(list.body.items.find((a) => a._id === first._id).isDefault).toBe(false);
  });

  it('rejects an invalid Indian PIN code', async () => {
    const { token } = f.customerToken();

    const res = await request(app)
      .post('/api/v1/addresses')
      .set(auth(token))
      .send({ ...ADDRESS, pincode: '0123' })
      .expect(422);

    expect(res.body.error.details[0].field).toBe('pincode');
  });

  it('will not let one customer read or edit another\'s address', async () => {
    const owner = f.customerToken();
    const other = f.customerToken();
    const address = await withAddress(owner.token);

    // 404 rather than 403 — a 403 would confirm it exists.
    await request(app)
      .patch(`/api/v1/addresses/${address._id}`)
      .set(auth(other.token))
      .send({ city: 'Hijacked' })
      .expect(404);

    const list = await request(app).get('/api/v1/addresses').set(auth(other.token)).expect(200);
    expect(list.body.items).toHaveLength(0);
  });

  it('soft-deletes, so an old order can still resolve the address', async () => {
    const { token, id } = f.customerToken();
    const address = await withAddress(token);

    await request(app).delete(`/api/v1/addresses/${address._id}`).set(auth(token)).expect(200);

    const list = await request(app).get('/api/v1/addresses').set(auth(token)).expect(200);
    expect(list.body.items).toHaveLength(0);

    // Still on disk, just flagged.
    const stored = await Address.findById(address._id).lean();
    expect(stored.deletedAt).not.toBeNull();
    expect(String(stored.userId)).toBe(id);
  });

  it('promotes another address when the default is deleted', async () => {
    const { token } = f.customerToken();
    const first = await withAddress(token);
    await withAddress(token);

    await request(app).delete(`/api/v1/addresses/${first._id}`).set(auth(token)).expect(200);

    const list = await request(app).get('/api/v1/addresses').set(auth(token)).expect(200);
    expect(list.body.items.filter((a) => a.isDefault)).toHaveLength(1);
  });

  it('requires a customer token', async () => {
    await request(app).get('/api/v1/addresses').expect(401);
    await request(app).get('/api/v1/addresses').set(auth(f.vendorToken().token)).expect(403);
  });
});

describe('checkout quote', () => {
  it('refuses to quote an empty cart', async () => {
    const { token } = f.customerToken();
    const res = await request(app).post('/api/v1/checkout/quote').set(auth(token)).send({}).expect(422);
    expect(res.body.error.message).toMatch(/empty/i);
  });

  it('prices identically to the cart — one pricing module, two callers', async () => {
    const product = await f.product({ price: 199900, stock: 5 });
    const { token } = f.customerToken();
    await withAddress(token);

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 2 });

    const cart = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);
    const quote = await request(app).post('/api/v1/checkout/quote').set(auth(token)).send({}).expect(200);

    expect(quote.body.summary.grandTotal.amount).toBe(cart.body.summary.grandTotal.amount);
    expect(quote.body.summary.taxTotal.amount).toBe(cart.body.summary.taxTotal.amount);
  });

  it('writes nothing — safe to call repeatedly', async () => {
    const product = await f.product({ price: 100000, stock: 7 });
    const { token } = f.customerToken();
    await withAddress(token);
    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });

    await request(app).post('/api/v1/checkout/quote').set(auth(token)).send({}).expect(200);
    await request(app).post('/api/v1/checkout/quote').set(auth(token)).send({}).expect(200);

    expect((await Product.findById(product._id)).stock).toBe(7);
  });

  it('reports a missing address rather than failing the quote', async () => {
    const product = await f.product({ stock: 5 });
    const { token } = f.customerToken();
    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });

    const res = await request(app).post('/api/v1/checkout/quote').set(auth(token)).send({}).expect(200);

    expect(res.body.address).toBeNull();
    expect(res.body.addressError).toMatch(/address/i);
  });
});

describe('place order from the server cart', () => {
  it('creates the order, snapshots the address and empties the cart', async () => {
    const product = await f.product({ price: 199900, stock: 5 });
    const { token } = f.customerToken();
    await withAddress(token);

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 2 });

    const res = await request(app)
      .post('/api/v1/checkout/place-order')
      .set(auth(token))
      .send({ paymentMethod: 'COD' })
      .expect(201);

    expect(res.body.order.items).toHaveLength(1);
    expect(res.body.order.shippingAddress.zipCode).toBe('411001');
    expect((await Product.findById(product._id)).stock).toBe(3);

    const cart = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);
    expect(cart.body.items).toEqual([]);
  });

  it('will not place an order without an address', async () => {
    const product = await f.product({ stock: 5 });
    const { token } = f.customerToken();
    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });

    const res = await request(app)
      .post('/api/v1/checkout/place-order')
      .set(auth(token))
      .send({})
      .expect(422);

    expect(res.body.error.message).toMatch(/address/i);
    // Stock is untouched when the order is refused.
    expect((await Product.findById(product._id)).stock).toBe(5);
  });

  it('leaves saved-for-later items in the cart after checkout', async () => {
    const buying = await f.product({ price: 100000, stock: 5 });
    const later = await f.product({ price: 50000, stock: 5 });
    const { token } = f.customerToken();
    await withAddress(token);

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: buying._id });
    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: later._id });
    await request(app).post(`/api/v1/cart/items/${later._id}/save-for-later`).set(auth(token));

    await request(app).post('/api/v1/checkout/place-order').set(auth(token)).send({}).expect(201);

    const cart = await request(app).get('/api/v1/cart').set(auth(token)).expect(200);
    expect(cart.body.items).toEqual([]);
    expect(cart.body.savedForLater).toHaveLength(1);
  });

  it('stores the full amount breakdown on the order', async () => {
    const product = await f.product({ price: 100000, stock: 5 });
    const { token } = f.customerToken();
    await withAddress(token);
    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });

    const res = await request(app)
      .post('/api/v1/checkout/place-order')
      .set(auth(token))
      .send({})
      .expect(201);

    const order = res.body.order;
    // ₹1,000 + 18% GST + ₹99 delivery.
    expect(order.totalAmount).toBe(100000 + 18000 + 9900);
  });

  it('rejects an order larger than available stock and restores nothing', async () => {
    const product = await f.product({ price: 100000, stock: 2 });
    const { token } = f.customerToken();
    await withAddress(token);

    await request(app)
      .post('/api/v1/cart/items')
      .set(auth(token))
      .send({ productId: product._id, quantity: 2 });

    // Someone else buys the stock between the cart and the checkout.
    await Product.updateOne({ _id: product._id }, { stock: 1 });

    const res = await request(app)
      .post('/api/v1/checkout/place-order')
      .set(auth(token))
      .send({})
      .expect(409);

    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await Product.findById(product._id)).stock).toBe(1);
  });
});

describe('coupon redemption', () => {
  beforeEach(async () => {
    await Coupon.insertMany(COUPONS);
  });

  it('records a redemption and increments the usage count', async () => {
    const product = await f.product({ price: 500000, stock: 5 });
    const { token, id } = f.customerToken();
    await withAddress(token);

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    await request(app).post('/api/v1/cart/coupon').set(auth(token)).send({ code: 'WELCOME10' });

    const res = await request(app)
      .post('/api/v1/checkout/place-order')
      .set(auth(token))
      .send({})
      .expect(201);

    expect(res.body.order.totalAmount).toBeLessThan(500000 + 90000);

    const redemption = await CouponRedemption.findOne({ couponCode: 'WELCOME10', userId: id });
    expect(redemption).not.toBeNull();
    expect(redemption.discountAmount).toBe(50000);

    const coupon = await Coupon.findOne({ code: 'WELCOME10' });
    expect(coupon.usedCount).toBe(1);
  });

  it('enforces the per-user limit on a second order', async () => {
    const product = await f.product({ price: 500000, stock: 20 });
    const { token } = f.customerToken();
    await withAddress(token);

    // WELCOME10 is usageLimitPerUser: 1.
    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    await request(app).post('/api/v1/cart/coupon').set(auth(token)).send({ code: 'WELCOME10' });
    await request(app).post('/api/v1/checkout/place-order').set(auth(token)).send({}).expect(201);

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    const res = await request(app)
      .post('/api/v1/cart/coupon')
      .set(auth(token))
      .send({ code: 'WELCOME10' })
      .expect(422);

    expect(res.body.error.message).toMatch(/already used/i);
  });

  it('a free-shipping coupon waives delivery on a small order', async () => {
    const product = await f.product({ price: 100000, stock: 5 }); // under the threshold
    const { token } = f.customerToken();
    await withAddress(token);

    await request(app).post('/api/v1/cart/items').set(auth(token)).send({ productId: product._id });
    await request(app).post('/api/v1/cart/coupon').set(auth(token)).send({ code: 'FREESHIP' });

    const res = await request(app)
      .post('/api/v1/checkout/place-order')
      .set(auth(token))
      .send({})
      .expect(201);

    expect(res.body.order.totalAmount).toBe(100000 + 18000);
  });
});
