import mongoose from 'mongoose';

export const COUPON_TYPES = ['percent', 'fixed', 'free_shipping'];

const couponSchema = new mongoose.Schema(
  {
    code: { type: String, required: true, unique: true, uppercase: true, trim: true },
    description: { type: String, trim: true, default: '' },
    type: { type: String, enum: COUPON_TYPES, required: true },

    // percent → 0–100. fixed → paise. free_shipping → ignored.
    value: { type: Number, required: true, min: 0 },
    // Caps a percentage coupon. Without it, one large order can cost more than
    // the campaign was worth.
    maxDiscount: { type: Number, min: 0, default: null },
    minOrderValue: { type: Number, min: 0, default: 0 },

    startsAt: { type: Date, default: Date.now },
    endsAt: { type: Date, default: null },

    usageLimitTotal: { type: Number, min: 0, default: null },
    usageLimitPerUser: { type: Number, min: 0, default: 1 },
    usedCount: { type: Number, default: 0, min: 0 },

    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

couponSchema.index({ isActive: 1, startsAt: 1, endsAt: 1 });

const Coupon = mongoose.model('Coupon', couponSchema);
export default Coupon;
