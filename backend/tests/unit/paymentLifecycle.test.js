// tests/unit/paymentLifecycle.test.js
//
// The rule: nothing is BOUGHT until the money arrives.
//
// For an online order that means the cart and the coupon are untouched at
// checkout and consumed only in markPaid(). Before this, closing the Razorpay
// window left the customer with an empty cart and a spent single-use coupon
// for an order that never happened.
//
// No database is available in the unit project, so each collaborator is
// stubbed and the tests assert WHAT is called and IN WHAT ORDER — which is
// exactly where these bugs lived.
import { jest } from '@jest/globals';

import { checkoutService } from '../../modules/checkout/checkout.service.js';
import { paymentService, __testing } from '../../modules/payments/payment.service.js';
import { cartService } from '../../modules/cart/cart.service.js';
import { cartRepo } from '../../modules/cart/cart.repo.js';
import { couponService } from '../../modules/checkout/coupon.service.js';
import { addressService } from '../../modules/addresses/address.service.js';
import { productRepo } from '../../modules/catalog/product.repo.js';
import { orderRepo } from '../../modules/orders/order.repo.js';
import { updateStatusSchema } from '../../modules/orders/order.schema.js';
import Order, { VENDOR_VISIBLE_ORDER, ABANDONED_ORDER } from '../../model/order.model.js';
import Payment from '../../model/payment.model.js';
import { COUPONS } from '../../lib/coupons.data.js';

const { markPaid, releasePendingOrder, clearPurchasedFromCart } = __testing;

const USER = { id: '507f1f77bcf86cd799439011', name: 'Shravani', email: 's@x.in' };
const WELCOME10 = COUPONS.find((c) => c.code === 'WELCOME10');

const LINE = {
  productId: '66f000000000000000000001',
  title: 'Sony WH-1000XM5',
  unitPrice: 2699000, // ₹26,990 — above WELCOME10's minimum
  quantity: 1,
  image: '/media/products/headphones/graphite/front.svg',
  companyId: null,
};

afterEach(() => jest.restoreAllMocks());

// ------------------------------------------------------------ checkout

function stubCheckout() {
  const cart = {
    couponCode: 'WELCOME10',
    items: [
      { productId: LINE.productId, quantity: 1, savedForLater: false },
      { productId: '66f000000000000000000099', quantity: 1, savedForLater: true },
    ],
  };

  jest.spyOn(cartService, 'getChargeable').mockResolvedValue({ cart, chargeable: [LINE], dto: {} });
  jest.spyOn(couponService, 'resolve').mockResolvedValue({ coupon: WELCOME10, reason: null });
  jest.spyOn(addressService, 'resolveForCheckout').mockResolvedValue({
    _id: 'a1', line1: 'Flat 1', city: 'Nagpur', state: 'MH', pincode: '440015', phone: '9999999999',
  });

  return {
    cart,
    supersede: jest.spyOn(paymentService, 'supersedePendingOrders').mockResolvedValue({ released: 0 }),
    reserve: jest.spyOn(productRepo, 'reserveStock').mockResolvedValue({ _id: LINE.productId }),
    create: jest.spyOn(orderRepo, 'create').mockImplementation(async (doc) => ({
      ...doc,
      _id: '66f0000000000000000000aa',
      toObject() {
        return { ...doc, _id: '66f0000000000000000000aa' };
      },
    })),
    redeem: jest.spyOn(couponService, 'redeem').mockResolvedValue(),
    saveCart: jest.spyOn(cartRepo, 'save').mockResolvedValue(),
  };
}

describe('placeOrder — online (Razorpay)', () => {
  it('leaves the cart alone and does not spend the coupon', async () => {
    const s = stubCheckout();
    await checkoutService.placeOrder(USER, { addressId: 'a1', paymentMethod: 'Razorpay' });

    expect(s.saveCart).not.toHaveBeenCalled();
    expect(s.redeem).not.toHaveBeenCalled();
    expect(s.cart.items).toHaveLength(2);
    expect(s.cart.couponCode).toBe('WELCOME10');
  });

  it('creates the order awaiting payment, with the discount still priced in', async () => {
    const s = stubCheckout();
    await checkoutService.placeOrder(USER, { addressId: 'a1', paymentMethod: 'Razorpay' });

    const doc = s.create.mock.calls[0][0];
    expect(doc.status).toBe('PendingPayment');
    expect(doc.payment.status).toBe('Pending');
    // The coupon still applies to the price — it is just not SPENT yet.
    expect(doc.couponCode).toBe('WELCOME10');
    expect(doc.amounts.discountTotal).toBeGreaterThan(0);
  });

  it('cancels the previous unpaid attempt BEFORE reserving stock for this one', async () => {
    // Otherwise retrying a low-stock item fails against your own abandoned order.
    const s = stubCheckout();
    await checkoutService.placeOrder(USER, { addressId: 'a1', paymentMethod: 'Razorpay' });

    expect(s.supersede).toHaveBeenCalledWith(USER.id);
    expect(s.supersede.mock.invocationCallOrder[0]).toBeLessThan(
      s.reserve.mock.invocationCallOrder[0]
    );
  });
});

describe('placeOrder — cash on delivery', () => {
  it('is bought immediately: coupon spent, purchased lines cleared, saved-for-later kept', async () => {
    const s = stubCheckout();
    await checkoutService.placeOrder(USER, { addressId: 'a1', paymentMethod: 'COD' });

    expect(s.redeem).toHaveBeenCalledTimes(1);
    expect(s.saveCart).toHaveBeenCalledTimes(1);
    expect(s.cart.items).toEqual([expect.objectContaining({ savedForLater: true })]);
    expect(s.cart.couponCode).toBeNull();
  });

  it('does not supersede anything — there is no payment to wait for', async () => {
    const s = stubCheckout();
    await checkoutService.placeOrder(USER, { addressId: 'a1', paymentMethod: 'COD' });
    expect(s.supersede).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------------- markPaid

const PAYMENT = { _id: 'p1', orderId: '66f0000000000000000000aa', amount: 2429100, confirmedBy: null };

function orderDoc(overrides = {}) {
  return {
    _id: '66f0000000000000000000aa',
    status: 'PendingPayment',
    customerId: USER.id,
    customerName: USER.name,
    customerEmail: USER.email,
    couponCode: 'WELCOME10',
    amounts: { grandTotal: 2429100, discountTotal: 269900 },
    items: [
      { productId: LINE.productId, title: LINE.title, price: LINE.unitPrice, quantity: 1 },
      { productId: '66f000000000000000000002', title: 'Case', price: 99900, quantity: 2 },
    ],
    shippingAddress: { street: 'Flat 1', city: 'Nagpur', zipCode: '440015' },
    ...overrides,
  };
}

function stubMarkPaid({ before }) {
  const findOneAndUpdate = jest
    .spyOn(Order, 'findOneAndUpdate')
    .mockResolvedValueOnce(before) // the claim
    .mockResolvedValueOnce({ ...orderDoc(), status: 'Processing' }); // → Processing
  jest.spyOn(Payment, 'updateOne').mockResolvedValue({});
  return {
    findOneAndUpdate,
    orderUpdateOne: jest.spyOn(Order, 'updateOne').mockResolvedValue({}),
    redeem: jest.spyOn(couponService, 'redeem').mockResolvedValue(),
    findCart: jest.spyOn(cartRepo, 'find').mockResolvedValue({
      couponCode: 'WELCOME10',
      items: [
        { productId: LINE.productId, quantity: 2, savedForLater: false },
        { productId: '66f000000000000000000002', quantity: 2, savedForLater: false },
        { productId: '66f000000000000000000003', quantity: 1, savedForLater: true },
      ],
    }),
    saveCart: jest.spyOn(cartRepo, 'save').mockResolvedValue(),
    reserve: jest.spyOn(productRepo, 'reserveStock'),
    release: jest.spyOn(productRepo, 'releaseStock').mockResolvedValue({}),
  };
}

describe('markPaid — normal confirmation', () => {
  it('claims atomically on "not already Paid"', async () => {
    const s = stubMarkPaid({ before: orderDoc() });
    await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'callback' });

    const [filter, update, options] = s.findOneAndUpdate.mock.calls[0];
    expect(filter['payment.status']).toEqual({ $ne: 'Paid' });
    expect(update.$set['payment.status']).toBe('Paid');
    // new: false — the claim needs the order AS IT WAS to know if it was cancelled.
    expect(options.new).toBe(false);
  });

  it('spends the coupon and removes exactly what was bought from the cart', async () => {
    const s = stubMarkPaid({ before: orderDoc() });
    await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'callback' });

    expect(s.redeem).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'WELCOME10', discountAmount: 269900 })
    );

    const cart = s.saveCart.mock.calls[0][0];
    // Bought 1 of 2 headphones → 1 left. Bought 2 of 2 cases → line gone.
    // Saved-for-later untouched. Coupon cleared because this order used it.
    expect(cart.items).toEqual([
      expect.objectContaining({ productId: LINE.productId, quantity: 1 }),
      expect.objectContaining({ productId: '66f000000000000000000003', savedForLater: true }),
    ]);
    expect(cart.couponCode).toBeNull();
  });

  it('does not re-reserve stock for an order that was never released', async () => {
    const s = stubMarkPaid({ before: orderDoc() });
    await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'webhook' });
    expect(s.reserve).not.toHaveBeenCalled();
  });
});

describe('markPaid — duplicate confirmation', () => {
  it('does nothing a second time: no coupon, no cart change, no revival', async () => {
    // The callback and the webhook both arrive. The second loses the claim.
    const s = stubMarkPaid({ before: null });
    const result = await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'webhook' });

    expect(result.alreadyConfirmed).toBe(true);
    expect(s.redeem).not.toHaveBeenCalled();
    expect(s.findCart).not.toHaveBeenCalled();
    expect(s.reserve).not.toHaveBeenCalled();
  });
});

describe('markPaid — payment lands after the order was released', () => {
  it('takes the stock again and completes the order when it is still available', async () => {
    const s = stubMarkPaid({ before: orderDoc({ status: 'Cancelled' }) });
    s.reserve.mockResolvedValue({ ok: true });

    const result = await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'webhook' });

    expect(s.reserve).toHaveBeenCalledTimes(2);
    expect(result.confirmed).toBe(true);
    expect(s.findOneAndUpdate.mock.calls[1][1].$set.status).toBe('Processing');
  });

  it('flags a refund — and ships nothing — when the stock has sold since', async () => {
    const s = stubMarkPaid({ before: orderDoc({ status: 'Cancelled' }) });
    s.reserve.mockResolvedValueOnce({ ok: true }).mockResolvedValueOnce(null);

    const result = await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'webhook' });

    expect(result.needsRefund).toBe(true);
    // The first line's units, taken during the attempt, are given back.
    expect(s.release).toHaveBeenCalledWith(LINE.productId, 1);
    expect(s.orderUpdateOne.mock.calls[0][1].$set['payment.needsRefund']).toBe(true);
    // Never moved to Processing, no coupon spent, cart untouched.
    expect(s.findOneAndUpdate).toHaveBeenCalledTimes(1);
    expect(s.redeem).not.toHaveBeenCalled();
    expect(s.findCart).not.toHaveBeenCalled();
  });
});

describe('markPaid — nothing after the money may fail the confirmation', () => {
  it('still confirms if the coupon redemption and the cart clear both throw', async () => {
    const s = stubMarkPaid({ before: orderDoc() });
    s.redeem.mockRejectedValue(new Error('db blip'));
    s.findCart.mockRejectedValue(new Error('db blip'));

    const result = await markPaid({ payment: PAYMENT, providerPaymentId: 'pay_1', confirmedBy: 'callback' });
    expect(result.confirmed).toBe(true);
  });
});

// ---------------------------------------------------- releasing stock

describe('releasePendingOrder', () => {
  it('releases stock only if THIS call cancelled the order', async () => {
    jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValue(null); // paid, or already released
    const release = jest.spyOn(productRepo, 'releaseStock').mockResolvedValue({});

    expect(await releasePendingOrder('o1', 'test')).toBe(false);
    expect(release).not.toHaveBeenCalled();
  });

  it('never cancels a paid order', async () => {
    const find = jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValue(null);
    jest.spyOn(productRepo, 'releaseStock').mockResolvedValue({});
    await releasePendingOrder('o1', 'test');

    const [filter] = find.mock.calls[0];
    expect(filter.status).toBe('PendingPayment');
    expect(filter['payment.status']).toEqual({ $ne: 'Paid' });
  });

  it('puts every line back when it does cancel', async () => {
    jest.spyOn(Order, 'findOneAndUpdate').mockResolvedValue(orderDoc({ status: 'Cancelled' }));
    jest.spyOn(Payment, 'updateMany').mockResolvedValue({});
    const release = jest.spyOn(productRepo, 'releaseStock').mockResolvedValue({});

    expect(await releasePendingOrder('o1', 'test')).toBe(true);
    expect(release).toHaveBeenCalledWith(LINE.productId, 1);
    expect(release).toHaveBeenCalledWith('66f000000000000000000002', 2);
  });
});

describe('expireStale', () => {
  it('includes declined payments, which used to hold their stock forever', async () => {
    const find = jest.spyOn(Order, 'find').mockReturnValue({ limit: () => Promise.resolve([]) });
    await paymentService.expireStale();

    const [filter] = find.mock.calls[0];
    expect(filter['payment.status'].$in).toEqual(expect.arrayContaining(['Pending', 'Failed']));
  });
});

describe('clearPurchasedFromCart', () => {
  it('keeps a coupon the customer applied to something else', async () => {
    const cart = { couponCode: 'STUDENT15', items: [{ productId: LINE.productId, quantity: 1, savedForLater: false }] };
    jest.spyOn(cartRepo, 'find').mockResolvedValue(cart);
    const save = jest.spyOn(cartRepo, 'save').mockResolvedValue();

    await clearPurchasedFromCart(orderDoc({ couponCode: 'WELCOME10' }));
    expect(save.mock.calls[0][0].couponCode).toBe('STUDENT15');
  });
});

// ------------------------------------------------- who sees unpaid orders

describe('unpaid orders are invisible to vendors', () => {
  it('the vendor filter excludes orders awaiting payment and abandoned attempts', () => {
    expect(VENDOR_VISIBLE_ORDER.status).toEqual({ $ne: 'PendingPayment' });
    expect(VENDOR_VISIBLE_ORDER.$nor).toEqual([ABANDONED_ORDER]);
  });

  it('an abandoned attempt is one that was cancelled without ever being paid', () => {
    expect(ABANDONED_ORDER).toEqual({
      status: 'Cancelled',
      'payment.status': 'Failed',
      'payment.paidAt': null,
    });
  });

  it('nobody can move an order INTO PendingPayment by hand', () => {
    expect(updateStatusSchema.body.safeParse({ status: 'PendingPayment' }).success).toBe(false);
    expect(updateStatusSchema.body.safeParse({ status: 'Shipped' }).success).toBe(true);
  });
});
