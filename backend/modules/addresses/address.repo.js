import Address from '../../model/address.model.js';

export const addressRepo = {
  listForUser: (userId) =>
    Address.find({ userId, deletedAt: null })
      .sort({ isDefault: -1, updatedAt: -1 })
      .lean(),

  findOwned: (id, userId) => Address.findOne({ _id: id, userId, deletedAt: null }),

  count: (userId) => Address.countDocuments({ userId, deletedAt: null }),

  create: (doc) => Address.create(doc),

  /** userId in the filter is the ownership check. */
  updateOwned: (id, userId, updates) =>
    Address.findOneAndUpdate({ _id: id, userId, deletedAt: null }, updates, {
      new: true,
      runValidators: true,
    }),

  /** Soft delete — an old order must still resolve the address it shipped to. */
  softDelete: (id, userId) =>
    Address.findOneAndUpdate(
      { _id: id, userId, deletedAt: null },
      { deletedAt: new Date(), isDefault: false },
      { new: true }
    ),

  /** Exactly one default per user. */
  clearDefaults: (userId, exceptId = null) =>
    Address.updateMany(
      { userId, isDefault: true, ...(exceptId ? { _id: { $ne: exceptId } } : {}) },
      { isDefault: false }
    ),

  findDefault: (userId) => Address.findOne({ userId, deletedAt: null, isDefault: true }).lean(),

  findAnyNewest: (userId) =>
    Address.findOne({ userId, deletedAt: null }).sort({ updatedAt: -1 }).lean(),
};
