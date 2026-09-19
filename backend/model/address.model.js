import mongoose from 'mongoose';

// Addresses are their own collection rather than an array on the user, because
// an order must SNAPSHOT the address it shipped to. As a live reference,
// editing your address would rewrite where a past order went.
const addressSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cutomers',
      required: true,
      index: true,
    },
    label: { type: String, trim: true, default: 'Home', maxlength: 40 },
    fullName: { type: String, required: true, trim: true, maxlength: 120 },
    phone: { type: String, required: true, trim: true, maxlength: 20 },
    line1: { type: String, required: true, trim: true, maxlength: 300 },
    line2: { type: String, trim: true, maxlength: 300, default: '' },
    city: { type: String, required: true, trim: true, maxlength: 120 },
    state: { type: String, required: true, trim: true, maxlength: 120 },
    pincode: { type: String, required: true, trim: true, maxlength: 10 },
    country: { type: String, default: 'India', maxlength: 60 },

    isDefault: { type: Boolean, default: false },

    // Soft delete: a removed address must stay resolvable from an old order.
    deletedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

// The address list, default first.
addressSchema.index({ userId: 1, deletedAt: 1, isDefault: -1, updatedAt: -1 });

const Address = mongoose.model('Address', addressSchema);
export default Address;
