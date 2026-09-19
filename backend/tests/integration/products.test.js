import request from 'supertest';
import { createApp } from '../../server.js';
import * as f from '../factories.js';

const app = createApp();

describe('GET /api/v1/products', () => {
  it('returns a paginated envelope, not a bare array', async () => {
    await f.product();
    await f.product();

    const res = await request(app).get('/api/v1/products').expect(200);

    expect(Array.isArray(res.body)).toBe(false);
    expect(res.body).toMatchObject({ page: 1, total: 2, totalPages: 1, hasMore: false });
    expect(res.body.items).toHaveLength(2);
  });

  it('paginates', async () => {
    await Promise.all([f.product(), f.product(), f.product()]);

    const res = await request(app).get('/api/v1/products?page=1&limit=2').expect(200);

    expect(res.body.items).toHaveLength(2);
    expect(res.body.totalPages).toBe(2);
    expect(res.body.hasMore).toBe(true);
  });

  it('returns money as integer paise plus a formatted label', async () => {
    await f.product({ price: 249900 });

    const res = await request(app).get('/api/v1/products').expect(200);

    expect(res.body.items[0].price).toBe(249900);
    expect(res.body.items[0].priceLabel).toBe('₹2,499.00');
  });

  it('still serves the legacy unversioned path', async () => {
    await f.product();
    const res = await request(app).get('/api/products').expect(200);
    expect(res.body.items).toHaveLength(1);
  });
});

describe('product write access', () => {
  const newProduct = {
    title: 'A New Laptop',
    description: 'Ten characters or more of description.',
    price: 149900,
    category: 'Laptops',
    brand: 'TestBrand',
  };

  it('rejects an anonymous create with 401', async () => {
    await request(app).post('/api/v1/products').send(newProduct).expect(401);
  });

  it('lets a vendor create, and assigns ownership from the token not the body', async () => {
    const vendor = f.vendorToken();
    const attacker = f.vendorToken();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ ...newProduct, companyId: attacker.id }) // should be ignored
      .expect(201);

    expect(String(res.body.product.companyId)).toBe(vendor.id);
  });

  it('rejects a price with decimal rupees, because money is paise', async () => {
    const vendor = f.vendorToken();

    const res = await request(app)
      .post('/api/v1/products')
      .set('Authorization', `Bearer ${vendor.token}`)
      .send({ ...newProduct, price: 1499.99 })
      .expect(422);

    expect(res.body.error.details[0].field).toBe('price');
  });
});

describe('vendor isolation', () => {
  it('will not let vendor A delete vendor B\'s product — 404, not 403', async () => {
    const owner = f.vendorToken();
    const other = f.vendorToken();
    const item = await f.product({ companyId: owner.id });

    // 404 rather than 403: a 403 would confirm the product exists.
    await request(app)
      .delete(`/api/v1/products/${item._id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .expect(404);

    const res = await request(app).get(`/api/v1/products/${item._id}`).expect(200);
    expect(res.body._id).toBeDefined();
  });

  it('will not let vendor A update vendor B\'s product', async () => {
    const owner = f.vendorToken();
    const other = f.vendorToken();
    const item = await f.product({ companyId: owner.id, price: 249900 });

    await request(app)
      .patch(`/api/v1/products/${item._id}`)
      .set('Authorization', `Bearer ${other.token}`)
      .send({ price: 100 })
      .expect(404);

    const res = await request(app).get(`/api/v1/products/${item._id}`).expect(200);
    expect(res.body.price).toBe(249900);
  });

  it('scopes /products/mine to the calling vendor', async () => {
    const mine = f.vendorToken();
    const theirs = f.vendorToken();
    await f.product({ companyId: mine.id });
    await f.product({ companyId: theirs.id });

    const res = await request(app)
      .get('/api/v1/products/mine')
      .set('Authorization', `Bearer ${mine.token}`)
      .expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(String(res.body.items[0].companyId)).toBe(mine.id);
  });
});

describe('GET /api/v1/products/facets', () => {
  it('returns the brands, categories and price bounds the filter sidebar needs', async () => {
    await f.product({ brand: 'Apple', category: 'Laptops', price: 249900 });
    await f.product({ brand: 'Apple', category: 'Laptops', price: 199900 });
    await f.product({ brand: 'Sony', category: 'Audio', price: 34900 });

    const res = await request(app).get('/api/v1/products/facets').expect(200);

    expect(res.body.total).toBe(3);
    expect(res.body.brands).toEqual(
      expect.arrayContaining([
        { value: 'Apple', count: 2 },
        { value: 'Sony', count: 1 },
      ])
    );
    expect(res.body.priceRange).toEqual({ min: 34900, max: 249900 });
  });

  it('narrows the facets to the current category', async () => {
    await f.product({ brand: 'Apple', category: 'Laptops' });
    await f.product({ brand: 'Sony', category: 'Audio' });

    const res = await request(app).get('/api/v1/products/facets?category=Audio').expect(200);

    expect(res.body.total).toBe(1);
    expect(res.body.brands).toEqual([{ value: 'Sony', count: 1 }]);
  });

  it('is matched as a route, not parsed as a product id', async () => {
    // '/facets' is declared before '/:id'; without that it would 422 as a bad id.
    await request(app).get('/api/v1/products/facets').expect(200);
  });
});

describe('GET /api/v1/products/:id/related', () => {
  it('returns same-category products and excludes the one being viewed', async () => {
    const viewing = await f.product({ category: 'Laptops' });
    await f.product({ category: 'Laptops' });
    await f.product({ category: 'Audio' });

    const res = await request(app).get(`/api/v1/products/${viewing._id}/related`).expect(200);

    expect(res.body.items).toHaveLength(1);
    expect(String(res.body.items[0]._id)).not.toBe(String(viewing._id));
    expect(res.body.items[0].category).toBe('Laptops');
  });
});
