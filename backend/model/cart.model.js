import mongoose from 'mongoose';

// A line remembers the price it was added at. That snapshot is NOT what gets
// charged — checkout always re-reads the live price — it exists so the cart can
// say "this went from ₹2,399 to ₹2,499 since you added it" instead of silently
// charging more. That single field is the difference between a cart and a
// trustworthy cart.
const cartItemSchema = new mongoose.Schema(
  {
    productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
    quantity: { type: Number, required: true, min: 1, max: 20 },
    priceSnapshot: { type: Number, required: true, min: 0 },
    snapshotAt: { type: Date, default: Date.now },
    // "Save for later": the line stays in the cart document but is excluded
    // from totals and from checkout.
    savedForLater: { type: Boolean, default: false },
    addedAt: { type: Date, default: Date.now },
  },
  { _id: false }
);

const cartSchema = new mongoose.Schema(
  {
    // Exactly one owner: a signed-in user, or an anonymous browser token.
    // Both unique-sparse so a cart can never belong to both.
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Cutomers',
      unique: true,
      sparse: true,
    },
    guestToken: { type: String, unique: true, sparse: true },

    items: [cartItemSchema],
    couponCode: { type: String, uppercase: true, trim: true, default: null },

    // Guest carts clean themselves up via the TTL index below; a signed-in
    // cart has no expiry.
    expiresAt: { type: Date, default: null },
  },
  { timestamps: true }
);

cartSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const Cart = mongoose.model('Cart', cartSchema);
export default Cart;
