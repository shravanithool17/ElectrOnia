import {
  priceOrder,
  amountToFreeShipping,
  FREE_SHIPPING_THRESHOLD,
  FLAT_SHIPPING_FEE,
  DEFAULT_TAX_RATE_PCT,
} from '../../lib/pricing.js';
import { COUPONS } from '../../lib/coupons.data.js';

// All amounts are integer paise. ₹1,000.00 is 100000.
const RS = (rupees) => rupees * 100;
const line = (unitPriceRupees, quantity = 1, taxRatePct) => ({
  unitPrice: RS(unitPriceRupees),
  quantity,
  taxRatePct,
});

const coupon = (code) => COUPONS.find((c) => c.code === code);

describe('pricing — subtotal and tax', () => {
  it('sums line totals exactly', () => {
    const result = priceOrder([line(1999, 2), line(349, 3)]);
    expect(result.itemsSubtotal).toBe(RS(1999 * 2 + 349 * 3));
  });

  it('applies 18% GST by default', () => {
    const result = priceOrder([line(1000)]);
    expect(result.taxTotal).toBe(RS(180));
    expect(DEFAULT_TAX_RATE_PCT).toBe(18);
  });

  it('honours a per-line tax rate, so a mixed cart is not blended', () => {
    const result = priceOrder([line(1000, 1, 18), line(1000, 1, 28)]);
    expect(result.taxTotal).toBe(RS(180) + RS(280));
  });

  it('returns zero for an empty cart rather than charging shipping', () => {
    const result = priceOrder([]);
    expect(result).toMatchObject({ itemsSubtotal: 0, shippingTotal: 0, grandTotal: 0 });
  });

  it('every returned amount is an integer', () => {
    const result = priceOrder([line(1333, 3), line(99, 7)], coupon('WELCOME10'));
    for (const value of Object.values(result)) {
      if (typeof value === 'number') expect(Number.isInteger(value)).toBe(true);
    }
  });
});

describe('pricing — shipping', () => {
  it('charges a flat fee below the threshold', () => {
    const result = priceOrder([line(1000)]);
    expect(result.shippingTotal).toBe(FLAT_SHIPPING_FEE);
  });

  it('is free at or above the threshold', () => {
    const result = priceOrder([line(FREE_SHIPPING_THRESHOLD / 100)]);
    expect(result.shippingTotal).toBe(0);
    expect(result.freeShipping).toBe(true);
  });

  it('decides shipping on the pre-discount subtotal', () => {
    // ₹5,200 qualifies for free delivery. A ₹500 coupon must not drag it back
    // under the threshold and re-add the fee.
    const result = priceOrder([line(5200)], coupon('FLAT500'));
    expect(result.shippingTotal).toBe(0);
  });

  it('reports how much more is needed for free delivery', () => {
    expect(amountToFreeShipping(RS(3000))).toBe(FREE_SHIPPING_THRESHOLD - RS(3000));
    expect(amountToFreeShipping(RS(9000))).toBe(0);
  });
});

describe('pricing — coupons', () => {
  it('applies a percentage discount', () => {
    const result = priceOrder([line(5000)], coupon('WELCOME10'));
    expect(result.discountTotal).toBe(RS(500));
    expect(result.appliedCoupon).toBe('WELCOME10');
  });

  it('caps a percentage coupon at maxDiscount', () => {
    // 10% of ₹1,00,000 is ₹10,000, but WELCOME10 caps at ₹2,000. Without the
    // cap one order costs more than the campaign.
    const result = priceOrder([line(100000)], coupon('WELCOME10'));
    expect(result.discountTotal).toBe(RS(2000));
  });

  it('refuses a coupon below its minimum order value', () => {
    const result = priceOrder([line(500)], coupon('WELCOME10'));
    expect(result.discountTotal).toBe(0);
    expect(result.couponError).toBe('MIN_ORDER_NOT_MET');
  });

  it('applies a fixed discount', () => {
    const result = priceOrder([line(6000)], coupon('FLAT500'));
    expect(result.discountTotal).toBe(RS(500));
  });

  it('never discounts below zero', () => {
    const result = priceOrder([line(6000)], { code: 'X', type: 'fixed', value: RS(99999) });
    expect(result.discountTotal).toBe(RS(6000));
    expect(result.grandTotal).toBeGreaterThanOrEqual(0);
  });

  it('a free-shipping coupon waives the fee without discounting goods', () => {
    const result = priceOrder([line(1000)], coupon('FREESHIP'));
    expect(result.discountTotal).toBe(0);
    expect(result.shippingTotal).toBe(0);
    expect(result.appliedCoupon).toBe('FREESHIP');
  });

  it('taxes the discounted value, not the list value', () => {
    const undiscounted = priceOrder([line(5000)]);
    const discounted = priceOrder([line(5000)], coupon('WELCOME10'));
    // 18% of ₹4,500 rather than of ₹5,000.
    expect(discounted.taxTotal).toBe(RS(810));
    expect(discounted.taxTotal).toBeLessThan(undiscounted.taxTotal);
  });

  it('spreads the discount across lines in proportion, for mixed tax rates', () => {
    const result = priceOrder([line(1000, 1, 18), line(1000, 1, 28)], {
      code: 'HALF',
      type: 'percent',
      value: 50,
    });
    // ₹500 off each line → 18% of 500 + 28% of 500.
    expect(result.discountTotal).toBe(RS(1000));
    expect(result.taxTotal).toBe(RS(90) + RS(140));
  });
});

describe('pricing — grand total', () => {
  it('is subtotal − discount + tax + shipping', () => {
    const result = priceOrder([line(2000)], coupon('WELCOME10'));
    expect(result.grandTotal).toBe(
      result.itemsSubtotal - result.discountTotal + result.taxTotal + result.shippingTotal
    );
  });

  it('is identical for the same inputs — the cart and checkout cannot diverge', () => {
    const lines = [line(1999, 2), line(349), line(89, 4)];
    const a = priceOrder(lines, coupon('SUMMER20'));
    const b = priceOrder(lines, coupon('SUMMER20'));
    expect(a).toEqual(b);
  });
});

describe('seeded coupons', () => {
  it('every percentage coupon has a discount cap', () => {
    for (const c of COUPONS.filter((x) => x.type === 'percent')) {
      expect(c.maxDiscount).toBeGreaterThan(0);
    }
  });

  it('codes are unique and uppercase', () => {
    const codes = COUPONS.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);
    codes.forEach((code) => expect(code).toBe(code.toUpperCase()));
  });

  it('fixed-value coupons are integer paise', () => {
    for (const c of COUPONS.filter((x) => x.type === 'fixed')) {
      expect(Number.isInteger(c.value)).toBe(true);
    }
  });
});
