import request from 'supertest';
import { createApp } from '../../server.js';
import Product from '../../model/product.model.js';
import * as f from '../factories.js';

const app = createApp();

describe('POST /api/v1/orders', () => {
  it('charges the database price, not the price in the request body', async () => {
    // The bug this test exists for: totalAmount used to be taken from the
    // body, so a ₹2,499 laptop could be ordered for ₹1.
    const item = await f.product({ price: 249900 });
    const customer = f.customerToken();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        items: [{ productId: item._id, quantity: 1, price: 100 }],
        totalAmount: 100, // tampered
        shippingAddress: f.address,
      })
      .expect(201);

    expect(res.body.order.totalAmount).toBe(249900);
    expect(res.body.order.items[0].price).toBe(249900);
  });

  it('multiplies price by quantity exactly', async () => {
    const item = await f.product({ price: 33333, stock: 10 });
    const customer = f.customerToken();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ items: [{ productId: item._id, quantity: 3 }], shippingAddress: f.address })
      .expect(201);

    expect(res.body.order.totalAmount).toBe(99999);
  });

  it('decrements stock', async () => {
    const item = await f.product({ stock: 5 });
    const customer = f.customerToken();

    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ items: [{ productId: item._id, quantity: 2 }], shippingAddress: f.address })
      .expect(201);

    expect((await Product.findById(item._id)).stock).toBe(3);
  });

  it('rejects an order larger than the available stock with 409', async () => {
    const item = await f.product({ stock: 2 });
    const customer = f.customerToken();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({ items: [{ productId: item._id, quantity: 5 }], shippingAddress: f.address })
      .expect(409);

    expect(res.body.error.code).toBe('INSUFFICIENT_STOCK');
    expect((await Product.findById(item._id)).stock).toBe(2); // untouched
  });

  it('lets only one of two concurrent orders take the last unit', async () => {
    const item = await f.product({ stock: 1 });
    const a = f.customerToken();
    const b = f.customerToken();

    const place = (token) =>
      request(app)
        .post('/api/v1/orders')
        .set('Authorization', `Bearer ${token}`)
        .send({ items: [{ productId: item._id, quantity: 1 }], shippingAddress: f.address });

    const results = await Promise.all([place(a.token), place(b.token)]);
    const statuses = results.map((r) => r.status).sort();

    expect(statuses).toEqual([201, 409]);
    expect((await Product.findById(item._id)).stock).toBe(0); // never negative
  });

  it('requires a complete shipping address', async () => {
    const item = await f.product();
    const customer = f.customerToken();

    const res = await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${customer.token}`)
      .send({
        items: [{ productId: item._id, quantity: 1 }],
        shippingAddress: { street: '1 Test Street' },
      })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('rejects a vendor token on a customer route', async () => {
    const item = await f.product();
    const vendor = f.vendorToken();

    await request(app)
      .post('/api/v1/orders')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ items: [{ productId: item._id, quantity: 1 }], shippingAddress: f.address })
      .expect(403);
  });
});

describe('order visibility', () => {
  it('shows a customer only their own orders', async () => {
    const mine = f.customerToken();
    const theirs = f.customerToken();
    await f.order({ customerId: mine.id });
    await f.order({ customerId: theirs.id });

    const res = await request(app)
      .get('/api/v1/orders/mine')
      .set('Authorization', `Bearer ${mine.token}`)
      .expect(200);

    expect(res.body).toHaveLength(1);
  });

  it('refuses vendor-orders to a customer token — it used to be wide open', async () => {
    const customer = f.customerToken();

    await request(app)
      .get('/api/v1/orders/vendor')
      .set('Authorization', `Bearer ${customer.token}`)
      .expect(403);
  });

  it('gives a vendor only the lines belonging to them', async () => {
    const vendorA = f.vendorToken();
    const vendorB = f.vendorToken();

    await f.order({
      vendorIds: [vendorA.id, vendorB.id],
      items: [
        { productId: (await f.product())._id, title: 'A item', price: 100000, quantity: 1, companyId: vendorA.id },
        { productId: (await f.product())._id, title: 'B item', price: 200000, quantity: 1, companyId: vendorB.id },
      ],
      totalAmount: 300000,
    });

    const res = await request(app)
      .get('/api/v1/orders/vendor')
      .set('Authorization', `Bearer ${vendorA.token}`)
      .expect(200);

    expect(res.body[0].items).toHaveLength(1);
    expect(res.body[0].items[0].title).toBe('A item');
  });
});

describe('PATCH /api/v1/orders/:id/status', () => {
  it('rejects a status outside the enum', async () => {
    const vendor = f.vendorToken();
    const placed = await f.order({ vendorIds: [vendor.id] });

    const res = await request(app)
      .patch(`/api/v1/orders/${placed._id}/status`)
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ status: 'Teleported' })
      .expect(422);

    expect(res.body.error.code).toBe('VALIDATION_FAILED');
  });

  it('will not let a vendor touch an order they have no line in', async () => {
    const owner = f.vendorToken();
    const other = f.vendorToken();
    const placed = await f.order({ vendorIds: [owner.id] });

    await request(app)
      .patch(`/api/v1/orders/${placed._id}/status`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ status: 'Shipped' })
      .expect(404);
  });

  it('records an audit trail in statusHistory', async () => {
    const vendor = f.vendorToken();
    const placed = await f.order({ vendorIds: [vendor.id] });

    const res = await request(app)
      .patch(`/api/v1/orders/${placed._id}/status`)
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ status: 'Shipped' })
      .expect(200);

    expect(res.body.order.status).toBe('Shipped');
    expect(res.body.order.statusHistory.at(-1)).toMatchObject({
      status: 'Shipped',
      byRole: 'vendor',
    });
  });
});
