// tests/factories.js — builders with sensible defaults.
//
// Factories rather than JSON fixtures: `product({ price: 100 })` states the
// one thing a test cares about, and the rest stays out of the way.
import mongoose from 'mongoose';
import { signToken, ROLES } from '../middleware/auth.js';
import Product from '../model/product.model.js';
import Order from '../model/order.model.js';

let counter = 0;
const unique = (prefix) => `${prefix}-${Date.now()}-${++counter}`;

export function customerToken(overrides = {}) {
  const id = overrides.id ?? new mongoose.Types.ObjectId().toString();
  return {
    id,
    token: signToken({
      id,
      email: overrides.email ?? `${unique('cust')}@example.com`,
      name: overrides.name ?? 'Test Customer',
      role: ROLES.CUSTOMER,
    }),
  };
}

export function vendorToken(overrides = {}) {
  const id = overrides.id ?? new mongoose.Types.ObjectId().toString();
  return {
    id,
    token: signToken({
      id,
      email: overrides.email ?? `${unique('vendor')}@example.com`,
      name: overrides.name ?? 'Test Vendor',
      role: ROLES.VENDOR,
    }),
  };
}

export function adminToken() {
  const id = new mongoose.Types.ObjectId().toString();
  return {
    id,
    token: signToken({ id, email: 'admin@example.com', name: 'Admin', role: ROLES.ADMIN }),
  };
}

/** price defaults to ₹2,499.00 expressed in paise. */
export async function product(overrides = {}) {
  return Product.create({
    title: overrides.title ?? unique('Test Laptop'),
    description: overrides.description ?? 'A product created for a test run.',
    price: overrides.price ?? 249900,
    originalPrice: overrides.originalPrice ?? 279900,
    category: overrides.category ?? 'Laptops',
    brand: overrides.brand ?? 'TestBrand',
    stock: overrides.stock ?? 10,
    images: ['https://example.com/image.jpg'],
    companyId: overrides.companyId ?? new mongoose.Types.ObjectId(),
    featured: overrides.featured ?? false,
  });
}

export async function order(overrides = {}) {
  const vendorId = overrides.vendorId ?? new mongoose.Types.ObjectId();
  return Order.create({
    customerId: overrides.customerId ?? new mongoose.Types.ObjectId(),
    customerName: 'Test Customer',
    customerEmail: 'customer@example.com',
    items: overrides.items ?? [
      {
        productId: new mongoose.Types.ObjectId(),
        title: 'Test Laptop',
        price: 249900,
        quantity: 1,
        companyId: vendorId,
      },
    ],
    totalAmount: overrides.totalAmount ?? 249900,
    shippingAddress: {
      street: '1 Test Street',
      city: 'Pune',
      zipCode: '411001',
      phone: '9999999999',
    },
    status: overrides.status ?? 'Processing',
    vendorIds: overrides.vendorIds ?? [vendorId],
  });
}

export const address = {
  street: '1 Test Street',
  city: 'Pune',
  zipCode: '411001',
  phone: '9999999999',
};
