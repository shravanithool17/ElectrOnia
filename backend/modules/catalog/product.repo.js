// modules/catalog/product.repo.js
import Product from '../../model/product.model.js';

export const productRepo = {
  /** Paginated catalogue read. Returns [items, total] in one round trip. */
  async findPage(filter, { sort, skip, limit }) {
    return Promise.all([
      Product.find(filter).sort(sort).skip(skip).limit(limit).lean(),
      Product.countDocuments(filter),
    ]);
  },

  findById: (id) => Product.findById(id).lean(),

  findByVendor: (vendorId) =>
    Product.find({ companyId: vendorId }).sort({ createdAt: -1 }).lean(),

  findManyByIds: (ids) => Product.find({ _id: { $in: ids } }).lean(),

  /**
   * Everything the filter sidebar needs, in one round trip.
   * $facet runs the sub-pipelines over the same matched set, so brands,
   * categories and the price range cost one pass rather than three queries.
   */
  facets: (filter = {}) =>
    Product.aggregate([
      { $match: filter },
      {
        $facet: {
          brands: [
            { $group: { _id: '$brand', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 30 },
          ],
          categories: [
            { $group: { _id: '$category', count: { $sum: 1 } } },
            { $sort: { _id: 1 } },
          ],
          price: [{ $group: { _id: null, min: { $min: '$price' }, max: { $max: '$price' } } }],
          total: [{ $count: 'value' }],
        },
      },
    ]),

  /** Same category, excluding the product being viewed. */
  findRelated: (product, limit) =>
    Product.find({ _id: { $ne: product._id }, category: product.category })
      .sort({ featured: -1, rating: -1 })
      .limit(limit)
      .lean(),

  create: (doc) => Product.create(doc),

  /**
   * The companyId in the filter *is* the ownership check — another vendor's
   * product simply does not match, so it reads as 404 rather than 403.
   */
  updateOwned: (id, vendorId, updates) =>
    Product.findOneAndUpdate({ _id: id, companyId: vendorId }, updates, {
      new: true,
      runValidators: true,
    }),

  deleteOwned: (id, vendorId) => Product.findOneAndDelete({ _id: id, companyId: vendorId }),

  /**
   * Atomic conditional decrement. The update only applies while stock is still
   * at least `qty`, so two simultaneous orders cannot both take the last unit.
   */
  reserveStock: (id, qty) =>
    Product.findOneAndUpdate(
      { _id: id, stock: { $gte: qty } },
      { $inc: { stock: -qty } },
      { new: true }
    ),

  releaseStock: (id, qty) => Product.updateOne({ _id: id }, { $inc: { stock: qty } }),
};
