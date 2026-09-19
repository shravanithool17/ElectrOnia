// modules/checkout/coupon.service.js — validity, and per-user limits.
import Coupon from '../../model/coupon.model.js';
import CouponRedemption from '../../model/couponRedemption.model.js';

/**
 * Resolves a code to a usable coupon, or a human reason why not.
 * Returns rather than throws, so the cart can render the reason inline.
 *
 * @returns {Promise<{coupon: object|null, reason: string|null}>}
 */
async function resolve(code, userId) {
  if (!code) return { coupon: null, reason: 'No coupon code given' };

  const coupon = await Coupon.findOne({ code: String(code).toUpperCase().trim() }).lean();
  if (!coupon) return { coupon: null, reason: 'That coupon code does not exist' };
  if (!coupon.isActive) return { coupon: null, reason: 'That coupon is no longer active' };

  const now = new Date();
  if (coupon.startsAt && now < coupon.startsAt) {
    return { coupon: null, reason: 'That coupon is not valid yet' };
  }
  if (coupon.endsAt && now > coupon.endsAt) {
    return { coupon: null, reason: 'That coupon has expired' };
  }
  if (coupon.usageLimitTotal != null && coupon.usedCount >= coupon.usageLimitTotal) {
    return { coupon: null, reason: 'That coupon has been fully redeemed' };
  }

  // Per-user limits only apply to a signed-in user; a guest is checked again
  // at checkout, which is the only place it can be enforced anyway.
  if (userId && coupon.usageLimitPerUser != null) {
    const used = await CouponRedemption.countDocuments({ couponCode: coupon.code, userId });
    if (used >= coupon.usageLimitPerUser) {
      return { coupon: null, reason: 'You have already used that coupon' };
    }
  }

  return { coupon, reason: null };
}

/**
 * Records a redemption. The unique index on (couponCode, orderId) is what
 * makes this safe under concurrency — a duplicate insert throws E11000 rather
 * than double-counting, so two simultaneous checkouts cannot both spend a
 * single-use coupon.
 */
async function redeem({ code, userId, orderId, discountAmount }) {
  if (!code) return;

  try {
    await CouponRedemption.create({ couponCode: code, userId, orderId, discountAmount });
    await Coupon.updateOne({ code }, { $inc: { usedCount: 1 } });
  } catch (err) {
    if (err.code === 11000) return; // already recorded for this order
    throw err;
  }
}

export const couponService = { resolve, redeem };
