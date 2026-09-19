// modules/vendor/vendor.repo.js — the aggregations behind the vendor dashboard.
//
// Every pipeline here starts by matching on `vendorIds`, which is indexed, and
// then unwinds to the vendor's own lines. A vendor must never see another
// vendor's revenue, so the item-level $match is not optional.
import mongoose from 'mongoose';
import Order, { VENDOR_VISIBLE_ORDER } from '../../model/order.model.js';
import Product from '../../model/product.model.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

/** Orders that count toward earnings. A cancelled order is not revenue. */
const EARNING_STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered'];

export const vendorRepo = {
  /**
   * Revenue, order count and per-status counts in one pass.
   * $facet lets the three sub-pipelines share the same matched set.
   */
  async summary(vendorId) {
    const id = oid(vendorId);

    const [result] = await Order.aggregate([
      // Unpaid and abandoned checkouts are not orders the vendor has — they
      // would inflate the order count and show up under "Pending".
      { $match: { vendorIds: id, ...VENDOR_VISIBLE_ORDER } },
      {
        $facet: {
          revenue: [
            { $match: { status: { $in: EARNING_STATUSES } } },
            { $unwind: '$items' },
            { $match: { 'items.companyId': id } },
            {
              $group: {
                _id: null,
                revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
                unitsSold: { $sum: '$items.quantity' },
              },
            },
          ],
          orders: [{ $count: 'value' }],
          byStatus: [{ $group: { _id: '$status', count: { $sum: 1 } } }],
        },
      },
    ]);

    return {
      revenue: result.revenue[0]?.revenue ?? 0,
      unitsSold: result.revenue[0]?.unitsSold ?? 0,
      orderCount: result.orders[0]?.value ?? 0,
      byStatus: result.byStatus.map((s) => ({ status: s._id, count: s.count })),
    };
  },

  /** Revenue per day for the last `days` days, for the trend chart. */
  async revenueSeries(vendorId, days = 14) {
    const id = oid(vendorId);
    const since = new Date();
    since.setUTCHours(0, 0, 0, 0);
    since.setUTCDate(since.getUTCDate() - (days - 1));

    return Order.aggregate([
      { $match: { vendorIds: id, createdAt: { $gte: since }, status: { $in: EARNING_STATUSES } } },
      { $unwind: '$items' },
      { $match: { 'items.companyId': id } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
          orders: { $addToSet: '$_id' },
        },
      },
      { $project: { _id: 1, revenue: 1, orders: { $size: '$orders' } } },
      { $sort: { _id: 1 } },
    ]);
  },

  /** Best sellers by revenue. */
  async topProducts(vendorId, limit = 5) {
    const id = oid(vendorId);

    return Order.aggregate([
      { $match: { vendorIds: id, status: { $in: EARNING_STATUSES } } },
      { $unwind: '$items' },
      { $match: { 'items.companyId': id } },
      {
        $group: {
          _id: '$items.productId',
          title: { $first: '$items.title' },
          image: { $first: '$items.image' },
          units: { $sum: '$items.quantity' },
          revenue: { $sum: { $multiply: ['$items.price', '$items.quantity'] } },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: limit },
    ]);
  },

  /** Catalogue health: totals, and the items about to sell out. */
  async inventory(vendorId, lowStockThreshold = 5) {
    const id = oid(vendorId);

    const [counts] = await Product.aggregate([
      { $match: { companyId: id } },
      {
        $facet: {
          total: [{ $count: 'value' }],
          low: [{ $match: { stock: { $gt: 0, $lte: lowStockThreshold } } }, { $count: 'value' }],
          out: [{ $match: { stock: { $lte: 0 } } }, { $count: 'value' }],
          stockValue: [
            {
              $group: {
                _id: null,
                value: { $sum: { $multiply: ['$price', '$stock'] } },
              },
            },
          ],
        },
      },
    ]);

    const lowStockItems = await Product.find({ companyId: id, stock: { $lte: lowStockThreshold } })
      .sort({ stock: 1 })
      .limit(10)
      .select('title stock price images')
      .lean();

    return {
      total: counts.total[0]?.value ?? 0,
      lowStock: counts.low[0]?.value ?? 0,
      outOfStock: counts.out[0]?.value ?? 0,
      stockValue: counts.stockValue[0]?.value ?? 0,
      lowStockItems,
    };
  },
};
