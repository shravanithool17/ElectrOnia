import Cart from '../../model/cart.model.js';

const GUEST_TTL_DAYS = 30;

function guestExpiry() {
  const date = new Date();
  date.setDate(date.getDate() + GUEST_TTL_DAYS);
  return date;
}

/** A cart belongs to a user OR a guest token, never both. */
export const ownerFilter = ({ userId, guestToken }) =>
  userId ? { userId } : { guestToken };

export const cartRepo = {
  find: (owner) => Cart.findOne(ownerFilter(owner)),

  /**
   * Upsert so a first "add to cart" does not need a separate create call —
   * which would race with itself on a double-click.
   */
  findOrCreate: (owner) =>
    Cart.findOneAndUpdate(
      ownerFilter(owner),
      {
        $setOnInsert: {
          ...ownerFilter(owner),
          items: [],
          couponCode: null,
          expiresAt: owner.userId ? null : guestExpiry(),
        },
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    ),

  save: (cart) => cart.save(),

  delete: (owner) => Cart.deleteOne(ownerFilter(owner)),
};
