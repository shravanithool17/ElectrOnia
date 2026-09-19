// tests/unit/fulfillment.test.js — shipping and delivery.
//
// Three layers:
//   1. the state machine and derived order status (pure — tested exhaustively)
//   2. carriers and validation (what a vendor can submit)
//   3. the service (who may act on which package, atomic transitions, side
//      effects) — collaborators stubbed, since there is no database here
import { jest } from '@jest/globals';

import {
  FULFILLMENT_STATUSES,
  TRANSITIONS,
  canTransition,
  sourcesFor,
  deriveOrderStatus,
  groupIntoFulfillments,
} from '../../lib/fulfillment.js';
import { CARRIERS, trackingLinkFor, carrierDisplayName, TRACKING_NUMBER } from '../../lib/carriers.js';
import { shipSchema, cancelPackageSchema } from '../../modules/fulfillment/fulfillment.schema.js';
import { updateStatusSchema } from '../../modules/orders/order.schema.js';
import { toOrderDtoFor } from '../../modules/orders/order.dto.js';
import { fulfillmentService, recomputeOrderStatus } from '../../modules/fulfillment/fulfillment.service.js';
import { templates } from '../../lib/mailer.js';
import Order from '../../model/order.model.js';
import { productRepo } from '../../modules/catalog/product.repo.js';

afterEach(() => jest.restoreAllMocks());

// ================================================================ 1. rules

describe('package state machine', () => {
  const legal = [
    ['Pending', 'Shipped'],
    ['Pending', 'Cancelled'],
    ['Shipped', 'OutForDelivery'],
    ['Shipped', 'Delivered'],
    ['OutForDelivery', 'Delivered'],
  ];

  it('allows exactly these moves and nothing else', () => {
    for (const from of FULFILLMENT_STATUSES) {
      for (const to of FULFILLMENT_STATUSES) {
        const expected = legal.some(([f, t]) => f === from && t === to);
        expect([from, to, canTransition(from, to)]).toEqual([from, to, expected]);
      }
    }
  });

  it('never un-delivers, un-ships or revives', () => {
    expect(canTransition('Delivered', 'Pending')).toBe(false);
    expect(canTransition('Delivered', 'Shipped')).toBe(false);
    expect(canTransition('Shipped', 'Pending')).toBe(false);
    expect(canTransition('Cancelled', 'Pending')).toBe(false);
  });

  it('does not cancel something already with the courier', () => {
    expect(canTransition('Shipped', 'Cancelled')).toBe(false);
    expect(canTransition('OutForDelivery', 'Cancelled')).toBe(false);
  });

  it('cannot deliver something never shipped', () => {
    expect(canTransition('Pending', 'Delivered')).toBe(false);
  });

  it('treats Delivered and Cancelled as terminal', () => {
    expect(TRANSITIONS.Delivered).toEqual([]);
    expect(TRANSITIONS.Cancelled).toEqual([]);
  });

  it('sourcesFor is the inverse of the table', () => {
    expect(sourcesFor('Delivered').sort()).toEqual(['OutForDelivery', 'Shipped']);
    expect(sourcesFor('Shipped')).toEqual(['Pending']);
    expect(sourcesFor('Pending')).toEqual([]);
  });
});

describe('deriveOrderStatus', () => {
  const pkgs = (...statuses) => statuses.map((status) => ({ status }));

  it.each([
    [['Pending'], 'Processing'],
    [['Shipped'], 'Shipped'],
    [['OutForDelivery'], 'Shipped'],
    [['Delivered'], 'Delivered'],
    [['Cancelled'], 'Cancelled'],
    [['Pending', 'Pending'], 'Processing'],
    [['Shipped', 'Pending'], 'PartiallyShipped'],
    [['Delivered', 'Pending'], 'PartiallyShipped'],
    [['Shipped', 'Delivered'], 'Shipped'],
    [['Delivered', 'Delivered'], 'Delivered'],
    [['Delivered', 'Cancelled'], 'Delivered'],
    [['Pending', 'Cancelled'], 'Processing'],
    [['Shipped', 'Cancelled'], 'Shipped'],
    [['Cancelled', 'Cancelled'], 'Cancelled'],
  ])('%j → %s', (statuses, expected) => {
    expect(deriveOrderStatus(pkgs(...statuses), 'Processing')).toBe(expected);
  });

  it('never moves an order that is still awaiting payment', () => {
    expect(deriveOrderStatus(pkgs('Shipped'), 'PendingPayment')).toBe('PendingPayment');
  });

  it('leaves an order with no packages as it was', () => {
    expect(deriveOrderStatus([], 'Processing')).toBe('Processing');
    expect(deriveOrderStatus(undefined, 'Shipped')).toBe('Shipped');
  });
});

describe('groupIntoFulfillments', () => {
  it('makes one package per vendor', () => {
    const packages = groupIntoFulfillments([
      { productId: 'p1', companyId: 'vendorA' },
      { productId: 'p2', companyId: 'vendorB' },
      { productId: 'p3', companyId: 'vendorA' },
    ]);
    expect(packages).toHaveLength(2);
    const a = packages.find((p) => p.vendorId === 'vendorA');
    expect(a.productIds).toEqual(['p1', 'p3']);
    expect(a.status).toBe('Pending');
    expect(a.history[0].status).toBe('Pending');
  });

  it('puts lines with no vendor into a package of their own, not into someone else\'s', () => {
    const packages = groupIntoFulfillments([
      { productId: 'p1', companyId: null },
      { productId: 'p2', companyId: 'vendorA' },
    ]);
    expect(packages.map((p) => p.vendorId).sort()).toEqual([null, 'vendorA'].sort());
  });
});

// ============================================================ 2. carriers

describe('carriers', () => {
  it('prefers the exact link the vendor pasted', () => {
    expect(
      trackingLinkFor({ carrier: 'delhivery', trackingNumber: 'AB123456', trackingUrl: 'https://x.test/t/AB123456' })
    ).toEqual({ url: 'https://x.test/t/AB123456', kind: 'exact' });
  });

  it('falls back to the carrier site, labelled as such — never a guessed deep link', () => {
    const link = trackingLinkFor({ carrier: 'bluedart', trackingNumber: 'AB123456' });
    expect(link).toEqual({ url: CARRIERS.bluedart.site, kind: 'carrier-site' });
  });

  it('has nothing to link for self-delivery', () => {
    expect(trackingLinkFor({ carrier: 'self' })).toEqual({ url: null, kind: null });
  });

  it('uses the typed name for "Other"', () => {
    expect(carrierDisplayName('other', 'Nagpur Express')).toBe('Nagpur Express');
    expect(carrierDisplayName('dtdc')).toBe('DTDC');
  });

  it('every listed site is https', () => {
    for (const carrier of Object.values(CARRIERS)) {
      if (carrier.site) expect(carrier.site.startsWith('https://')).toBe(true);
    }
  });

  it('tracking numbers: real formats pass, junk does not', () => {
    for (const ok of ['1234567890123', 'JD014600006612345678', 'EZ123456789IN', 'AWB-2024-0001']) {
      expect(TRACKING_NUMBER.test(ok)).toBe(true);
    }
    for (const bad of ['123', 'has space', '<script>', 'x'.repeat(41)]) {
      expect(TRACKING_NUMBER.test(bad)).toBe(false);
    }
  });
});

describe('ship request validation', () => {
  const parse = (body) => shipSchema.body.safeParse(body);

  it('requires a tracking number for any real courier', () => {
    const r = parse({ carrier: 'delhivery' });
    expect(r.success).toBe(false);
    expect(r.error.issues[0].path).toEqual(['trackingNumber']);
  });

  it('does not require one when the seller delivers it themselves', () => {
    expect(parse({ carrier: 'self' }).success).toBe(true);
  });

  it('requires a courier name for "Other"', () => {
    expect(parse({ carrier: 'other', trackingNumber: 'AB123456' }).success).toBe(false);
    expect(parse({ carrier: 'other', carrierName: 'Local Co', trackingNumber: 'AB123456' }).success).toBe(true);
  });

  it('refuses a tracking link that is not https — customers click it', () => {
    for (const url of ['http://x.test/t', 'javascript:alert(1)', 'not a url']) {
      expect(parse({ carrier: 'dtdc', trackingNumber: 'AB123456', trackingUrl: url }).success).toBe(false);
    }
    expect(parse({ carrier: 'dtdc', trackingNumber: 'AB123456', trackingUrl: 'https://x.test/t' }).success).toBe(true);
  });

  it('rejects an unknown courier key', () => {
    expect(parse({ carrier: 'fedex-ish', trackingNumber: 'AB123456' }).success).toBe(false);
  });

  it('a cancellation needs a reason the customer can read', () => {
    expect(cancelPackageSchema.body.safeParse({ reason: 'no' }).success).toBe(false);
    expect(cancelPackageSchema.body.safeParse({ reason: 'Out of stock at our warehouse' }).success).toBe(true);
  });
});

describe('legacy PATCH /status', () => {
  it('can no longer set derived states by hand', () => {
    for (const status of ['Pending', 'Processing', 'PartiallyShipped', 'PendingPayment']) {
      expect(updateStatusSchema.body.safeParse({ status }).success).toBe(false);
    }
  });
});

// ======================================================== 3. visibility

describe('what a vendor sees of a two-vendor order', () => {
  const order = {
    _id: 'o1',
    customerName: 'Shravani',
    customerEmail: 's@x.in',
    status: 'PartiallyShipped',
    totalAmount: 300000,
    items: [
      { productId: 'p1', title: 'Headphones', price: 200000, quantity: 1, companyId: 'vendorA' },
      { productId: 'p2', title: 'Charger', price: 100000, quantity: 1, companyId: 'vendorB' },
    ],
    fulfillments: [
      { _id: 'f1', vendorId: 'vendorA', productIds: ['p1'], status: 'Shipped', carrier: 'dtdc', trackingNumber: 'AAA111222' },
      { _id: 'f2', vendorId: 'vendorB', productIds: ['p2'], status: 'Pending' },
    ],
    shippingAddress: { street: 'x', city: 'Nagpur', zipCode: '440015', phone: '9' },
  };

  it('only their own lines and package', () => {
    const dto = toOrderDtoFor(order, { id: 'vendorB', role: 'vendor' });
    expect(dto.items.map((i) => i.title)).toEqual(['Charger']);
    expect(dto.fulfillments.map((f) => f._id)).toEqual(['f2']);
  });

  it('not the other vendor\'s tracking number', () => {
    const dto = toOrderDtoFor(order, { id: 'vendorB', role: 'vendor' });
    expect(JSON.stringify(dto)).not.toContain('AAA111222');
  });

  it('their share of the total, not what the customer spent elsewhere', () => {
    const dto = toOrderDtoFor(order, { id: 'vendorB', role: 'vendor' });
    expect(dto.totalAmount).toBe(100000);
  });

  it('not the customer\'s email', () => {
    expect(toOrderDtoFor(order, { id: 'vendorB', role: 'vendor' }).customerEmail).toBeUndefined();
  });

  it('the customer sees everything, with a tracking link per package', () => {
    const dto = toOrderDtoFor(order, { id: 'c1', role: 'customer' });
    expect(dto.fulfillments).toHaveLength(2);
    expect(dto.fulfillments[0]).toEqual(
      expect.objectContaining({ carrierName: 'DTDC', trackingLinkKind: 'carrier-site', statusLabel: 'Shipped' })
    );
    expect(dto.fulfillments[1].statusLabel).toBe('Being packed');
  });

  it('the customer can cancel only while every package is still being packed', () => {
    expect(toOrderDtoFor({ ...order, status: 'PartiallyShipped' }, { role: 'customer' }).canCancel).toBe(false);
    expect(
      toOrderDtoFor(
        { ...order, status: 'Processing', fulfillments: order.fulfillments.map((f) => ({ ...f, status: 'Pending' })) },
        { role: 'customer' }
      ).canCancel
    ).toBe(true);
  });
});

// ============================================================ 4. service

const VENDOR_A = { id: '66f00000000000000000000a', role: 'vendor' };
const VENDOR_B = { id: '66f00000000000000000000b', role: 'vendor' };
const ORDER_ID = '66f0000000000000000000aa';

function orderDoc(overrides = {}) {
  const doc = {
    _id: ORDER_ID,
    status: 'Processing',
    paymentMethod: 'COD',
    payment: { status: 'NotRequired' },
    customerName: 'Shravani',
    customerEmail: 's@x.in',
    fulfillmentVersion: 3,
    items: [
      { productId: 'p1', title: 'Headphones', price: 200000, quantity: 2, companyId: VENDOR_A.id },
      { productId: 'p2', title: 'Charger', price: 100000, quantity: 1, companyId: VENDOR_B.id },
    ],
    fulfillments: [
      { _id: 'f1', vendorId: VENDOR_A.id, productIds: ['p1'], status: 'Pending' },
      { _id: 'f2', vendorId: VENDOR_B.id, productIds: ['p2'], status: 'Pending' },
    ],
    ...overrides,
  };
  doc.fulfillments.id = (id) => doc.fulfillments.find((f) => String(f._id) === String(id));
  doc.toObject = () => doc;
  return doc;
}

function stubService({ found = orderDoc(), updated = found, afterRead = updated } = {}) {
  jest.spyOn(Order, 'findOne').mockResolvedValue(found);
  const findOneAndUpdate = jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValue(updated);
  const findById = jest.spyOn(Order, 'findById').mockImplementation(() => {
    const result = Promise.resolve(afterRead);
    result.lean = () => Promise.resolve(afterRead);
    return result;
  });
  const updateOne = jest.spyOn(Order, 'updateOne').mockResolvedValue({});
  const release = jest.spyOn(productRepo, 'releaseStock').mockResolvedValue({});
  const mail = {
    shipped: jest.spyOn(templates, 'orderShipped'),
    delivered: jest.spyOn(templates, 'orderDelivered'),
    cancelled: jest.spyOn(templates, 'packageCancelled'),
  };
  return { findOneAndUpdate, findById, updateOne, release, mail };
}

describe('ship', () => {
  it('moves only the calling vendor\'s package, conditioned on it still being Pending', async () => {
    const s = stubService();
    await fulfillmentService.ship(VENDOR_A, ORDER_ID, { carrier: 'dtdc', trackingNumber: 'AAA111222' });

    const [filter, update] = s.findOneAndUpdate.mock.calls[0];
    expect(filter.fulfillments.$elemMatch).toEqual({ _id: 'f1', status: { $in: ['Pending'] } });
    expect(update.$set['fulfillments.$.status']).toBe('Shipped');
    expect(update.$set['fulfillments.$.trackingNumber']).toBe('AAA111222');
    expect(update.$inc).toEqual({ fulfillmentVersion: 1 });
  });

  it('only loads orders the vendor has a line in, and only paid or COD ones', async () => {
    stubService();
    const findOne = Order.findOne;
    await fulfillmentService.ship(VENDOR_A, ORDER_ID, { carrier: 'dtdc', trackingNumber: 'AAA111222' });

    const [filter] = findOne.mock.calls[0];
    expect(String(filter.vendorIds)).toBe(VENDOR_A.id);
    expect(filter.status.$in).not.toContain('PendingPayment');
    expect(filter.status.$in).not.toContain('Cancelled');
  });

  it('a double click gets a 409, not a second shipment', async () => {
    const s = stubService();
    s.findOneAndUpdate.mockResolvedValue(null); // the first click already moved it
    await expect(
      fulfillmentService.ship(VENDOR_A, ORDER_ID, { carrier: 'dtdc', trackingNumber: 'AAA111222' })
    ).rejects.toMatchObject({ status: 409, code: 'ALREADY_UPDATED' });
    expect(s.mail.shipped).not.toHaveBeenCalled();
  });

  it('refuses to ship something already delivered, with a message that says so', async () => {
    const delivered = orderDoc();
    delivered.fulfillments[0].status = 'Delivered';
    stubService({ found: delivered });
    await expect(
      fulfillmentService.ship(VENDOR_A, ORDER_ID, { carrier: 'dtdc', trackingNumber: 'AAA111222' })
    ).rejects.toMatchObject({ status: 409, message: 'This package has already been delivered.' });
  });

  it('a vendor with no package in the order gets a 404, like any order that is not theirs', async () => {
    stubService();
    const stranger = { id: '66f00000000000000000000c', role: 'vendor' };
    await expect(
      fulfillmentService.ship(stranger, ORDER_ID, { carrier: 'dtdc', trackingNumber: 'AAA111222' })
    ).rejects.toMatchObject({ status: 404 });
  });

  it('a vendor cannot reach another vendor\'s package by naming its id', async () => {
    const s = stubService();
    await fulfillmentService.ship(VENDOR_A, ORDER_ID, {
      carrier: 'dtdc',
      trackingNumber: 'AAA111222',
      fulfillmentId: 'f2', // vendor B's
    });
    expect(s.findOneAndUpdate.mock.calls[0][0].fulfillments.$elemMatch._id).toBe('f1');
  });

  it('emails the customer about THIS package', async () => {
    const shipped = orderDoc();
    shipped.fulfillments[0] = { ...shipped.fulfillments[0], status: 'Shipped', carrier: 'dtdc', trackingNumber: 'AAA111222' };
    const s = stubService({ updated: shipped, afterRead: shipped });
    await fulfillmentService.ship(VENDOR_A, ORDER_ID, { carrier: 'dtdc', trackingNumber: 'AAA111222' });

    const args = s.mail.shipped.mock.calls[0][0];
    expect(args.items).toEqual([{ title: 'Headphones', quantity: 2 }]);
    expect(args.trackingNumber).toBe('AAA111222');
  });
});

describe('deliver', () => {
  it('can come straight from Shipped or from OutForDelivery', async () => {
    const shipped = orderDoc();
    shipped.fulfillments[0].status = 'Shipped';
    const s = stubService({ found: shipped });
    await fulfillmentService.deliver(VENDOR_A, ORDER_ID);

    const { $elemMatch } = s.findOneAndUpdate.mock.calls[0][0].fulfillments;
    expect($elemMatch.status.$in.sort()).toEqual(['OutForDelivery', 'Shipped']);
  });

  it('refuses an unshipped package', async () => {
    stubService();
    await expect(fulfillmentService.deliver(VENDOR_A, ORDER_ID)).rejects.toMatchObject({
      status: 409,
      message: 'Mark this package as shipped first.',
    });
  });
});

describe('recomputeOrderStatus', () => {
  it('writes only if no other package moved since it read', async () => {
    const snapshot = orderDoc({ fulfillmentVersion: 7 });
    snapshot.fulfillments[0].status = 'Shipped';
    const s = stubService({ afterRead: snapshot });

    await recomputeOrderStatus(ORDER_ID);

    const [filter, update] = s.updateOne.mock.calls[0];
    expect(filter).toEqual({ _id: ORDER_ID, fulfillmentVersion: 7 });
    expect(update.$set.status).toBe('PartiallyShipped');
    expect(update.$push.statusHistory.status).toBe('PartiallyShipped');
  });

  it('records cash collected when the last COD package is delivered', async () => {
    const snapshot = orderDoc({ status: 'Shipped' });
    snapshot.fulfillments.forEach((f) => {
      f.status = 'Delivered';
    });
    const s = stubService({ afterRead: snapshot });

    await recomputeOrderStatus(ORDER_ID);

    const { $set } = s.updateOne.mock.calls[0][1];
    expect($set.status).toBe('Delivered');
    expect($set['payment.status']).toBe('Paid');
    expect($set['payment.paidAt']).toBeInstanceOf(Date);
  });

  it('does not touch payment for an order paid online', async () => {
    const snapshot = orderDoc({ status: 'Shipped', paymentMethod: 'Razorpay', payment: { status: 'Paid' } });
    snapshot.fulfillments.forEach((f) => {
      f.status = 'Delivered';
    });
    const s = stubService({ afterRead: snapshot });

    await recomputeOrderStatus(ORDER_ID);
    expect(s.updateOne.mock.calls[0][1].$set['payment.status']).toBeUndefined();
  });

  it('writes nothing when nothing changed', async () => {
    const s = stubService({ afterRead: orderDoc() });
    await recomputeOrderStatus(ORDER_ID);
    expect(s.updateOne).not.toHaveBeenCalled();
  });
});

describe('cancelPackage (vendor)', () => {
  it('puts that package\'s stock back — and only that package\'s', async () => {
    const after = orderDoc();
    after.fulfillments[0].status = 'Cancelled';
    const s = stubService({ afterRead: after });

    await fulfillmentService.cancelPackage(VENDOR_A, ORDER_ID, { reason: 'Out of stock at the warehouse' });

    expect(s.release).toHaveBeenCalledTimes(1);
    expect(s.release).toHaveBeenCalledWith('p1', 2);
  });

  it('flags a refund when the order was paid online', async () => {
    const paid = orderDoc({ paymentMethod: 'Razorpay', payment: { status: 'Paid' } });
    const s = stubService({ found: paid, afterRead: paid });

    await fulfillmentService.cancelPackage(VENDOR_A, ORDER_ID, { reason: 'Out of stock at the warehouse' });

    const refundFlag = s.updateOne.mock.calls.find(([, u]) => u.$set?.['payment.needsRefund']);
    expect(refundFlag).toBeDefined();
    expect(s.mail.cancelled.mock.calls[0][0].refundDue).toBe(true);
  });

  it('does not flag a refund for cash on delivery', async () => {
    const s = stubService();
    await fulfillmentService.cancelPackage(VENDOR_A, ORDER_ID, { reason: 'Out of stock at the warehouse' });
    expect(s.updateOne.mock.calls.find(([, u]) => u.$set?.['payment.needsRefund'])).toBeUndefined();
  });
});

describe('cancelByCustomer', () => {
  const CUSTOMER = { id: '507f1f77bcf86cd799439011', role: 'customer' };

  it('cancels every package in ONE conditional write that requires all to be Pending', async () => {
    const s = stubService();
    await fulfillmentService.cancelByCustomer(CUSTOMER, ORDER_ID, { reason: 'Ordered by mistake' });

    const [filter, update] = s.findOneAndUpdate.mock.calls[0];
    expect(filter.fulfillments).toEqual({ $not: { $elemMatch: { status: { $ne: 'Pending' } } } });
    expect(update.$set['fulfillments.$[].status']).toBe('Cancelled');
    // Every line's stock comes back.
    expect(s.release).toHaveBeenCalledWith('p1', 2);
    expect(s.release).toHaveBeenCalledWith('p2', 1);
  });

  it('refuses once anything has shipped — and cancels nothing', async () => {
    const s = stubService();
    Order.findOne.mockResolvedValue(null);
    jest.spyOn(Order, 'exists').mockResolvedValue({ _id: ORDER_ID });

    await expect(fulfillmentService.cancelByCustomer(CUSTOMER, ORDER_ID, {})).rejects.toMatchObject({
      status: 409,
      code: 'CANNOT_CANCEL',
    });
    expect(s.release).not.toHaveBeenCalled();
  });

  it('loses the race cleanly if a vendor ships in the gap', async () => {
    const s = stubService();
    s.findOneAndUpdate.mockResolvedValue(null);

    await expect(fulfillmentService.cancelByCustomer(CUSTOMER, ORDER_ID, {})).rejects.toMatchObject({
      code: 'CANNOT_CANCEL',
    });
    expect(s.release).not.toHaveBeenCalled();
  });

  it('only finds the customer\'s own order', async () => {
    stubService();
    await fulfillmentService.cancelByCustomer(CUSTOMER, ORDER_ID, {});
    expect(String(Order.findOne.mock.calls[0][0].customerId)).toBe(CUSTOMER.id);
  });
});

// ============================================================== 5. emails

describe('shipping emails', () => {
  const base = { name: 'Shravani', orderId: '66f1a2b3c4d5e6f708192a3b', appUrl: 'https://e.test' };

  it('shipped: names the items, shows the number, labels a carrier-site link honestly', () => {
    const m = templates.orderShipped({
      ...base,
      items: [{ title: 'Sony WH-1000XM5', quantity: 1 }],
      carrierName: 'Blue Dart',
      trackingNumber: 'BD123456789',
      trackingUrl: 'https://www.bluedart.com',
      trackingLinkKind: 'carrier-site',
    });
    expect(m.subject).toContain('Sony WH-1000XM5');
    expect(m.html).toContain('BD123456789');
    expect(m.html).toContain('Open Blue Dart');
    expect(m.html).not.toContain('Track your package');
    expect(m.text).toContain('BD123456789');
  });

  it('shipped: an exact link is labelled "Track"', () => {
    const m = templates.orderShipped({
      ...base,
      items: [{ title: 'X', quantity: 1 }],
      carrierName: 'DTDC',
      trackingNumber: 'D1234567',
      trackingUrl: 'https://track.test/D1234567',
      trackingLinkKind: 'exact',
    });
    expect(m.html).toContain('Track your package');
  });

  it('cancelled: promises a refund only when one is due', () => {
    const paid = templates.packageCancelled({ ...base, items: [{ title: 'X', quantity: 1 }], refundDue: true, reason: 'Out of stock' });
    const cod = templates.packageCancelled({ ...base, items: [{ title: 'X', quantity: 1 }], refundDue: false });
    expect(paid.text).toMatch(/refunded/);
    expect(cod.text).toMatch(/Nothing was charged/);
    expect(cod.text).not.toMatch(/refunded/);
  });

  it('escapes a vendor-supplied reason and courier name', () => {
    const m = templates.packageCancelled({ ...base, items: [{ title: 'X', quantity: 1 }], reason: '<img src=x onerror=alert(1)>' });
    expect(m.html).not.toContain('<img src=x');
    const s = templates.orderShipped({ ...base, items: [{ title: 'X', quantity: 1 }], carrierName: '<b>evil</b>', trackingNumber: 'AB123456' });
    expect(s.html).not.toContain('<b>evil</b>');
  });

  it('leaves no template holes', () => {
    const all = [
      templates.orderShipped({ ...base, items: [{ title: 'X', quantity: 1 }], carrierName: 'DTDC', trackingNumber: null, trackingUrl: null }),
      templates.orderDelivered({ ...base, items: [{ title: 'X', quantity: 2 }] }),
      templates.packageCancelled({ ...base, items: [{ title: 'X', quantity: 1 }] }),
    ];
    for (const m of all) {
      expect(m.html + m.text).not.toMatch(/undefined|NaN|\[object Object\]|\$\{/);
    }
  });
});
