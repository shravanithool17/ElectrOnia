import mongoose from 'mongoose';

// One row per (coupon, order). The unique index is what makes per-user limits
// enforceable under concurrency: two simultaneous checkouts with the same
// single-use coupon cannot both insert, so exactly one wins. Checking a count
// first and then writing has a race; a unique index does not.
const couponRedemptionSchema = new mongoose.Schema(
  {
    couponCode: { type: String, required: true, uppercase: true, trim: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'Cutomers', required: true },
    orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true },
    discountAmount: { type: Number, required: true, min: 0 },
  },
  { timestamps: true }
);

couponRedemptionSchema.index({ couponCode: 1, orderId: 1 }, { unique: true });
couponRedemptionSchema.index({ couponCode: 1, userId: 1 });

const CouponRedemption = mongoose.model('CouponRedemption', couponRedemptionSchema);
export default CouponRedemption;
