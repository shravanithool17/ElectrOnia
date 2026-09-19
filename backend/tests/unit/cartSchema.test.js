// tests/unit/cartSchema.test.js
//
// The merge endpoint's contract changed: the guest token now comes from the
// httpOnly cookie, because a page script cannot read that cookie and so cannot
// put the token in the body. These tests pin the schema half of that change —
// an empty body has to validate, or the browser's merge call 400s and every
// pre-login cart is silently abandoned at sign-in.
import {
  mergeSchema,
  addItemSchema,
  updateItemSchema,
  couponSchema,
} from '../../modules/cart/cart.schema.js';

describe('cart merge schema', () => {
  it('accepts an empty body — the token comes from the cookie', () => {
    expect(mergeSchema.body.safeParse({}).success).toBe(true);
  });

  it('still accepts an explicit token, for tests and server-to-server calls', () => {
    const result = mergeSchema.body.safeParse({ guestToken: 'a'.repeat(32) });
    expect(result.success).toBe(true);
    expect(result.data.guestToken).toHaveLength(32);
  });

  it('rejects a token too short to be one of ours', () => {
    expect(mergeSchema.body.safeParse({ guestToken: 'abc' }).success).toBe(false);
  });
});

describe('cart item schemas', () => {
  it('defaults quantity to 1 and caps it', () => {
    const id = '507f1f77bcf86cd799439011';
    expect(addItemSchema.body.safeParse({ productId: id }).data.quantity).toBe(1);
    expect(addItemSchema.body.safeParse({ productId: id, quantity: 21 }).success).toBe(false);
    expect(addItemSchema.body.safeParse({ productId: id, quantity: 0 }).success).toBe(false);
  });

  it('refuses an id that is not an ObjectId', () => {
    expect(addItemSchema.body.safeParse({ productId: 'not-an-id' }).success).toBe(false);
  });

  it('will not accept a quantity of zero as a way to delete a line', () => {
    // Removing a line is DELETE, not PATCH 0 — otherwise two code paths mean
    // the same thing and only one of them is tested.
    expect(updateItemSchema.body.safeParse({ quantity: 0 }).success).toBe(false);
  });

  it('upper-cases and trims a coupon code so "welcome10 " matches WELCOME10', () => {
    const result = couponSchema.body.safeParse({ code: ' welcome10 ' });
    expect(result.success).toBe(true);
    expect(result.data.code).toBe('WELCOME10');
  });
});
