// modules/vendor/vendor.service.js
import { formatINR } from '../../lib/money.js';
import { vendorRepo } from './vendor.repo.js';

const DAYS = 14;

/**
 * Fills the gaps in a sparse series. A day with no orders must still appear,
 * otherwise the chart's x-axis is uneven and the shape lies.
 */
function densify(rows, days) {
  const byDate = new Map(rows.map((r) => [r._id, r]));
  const series = [];

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date();
    date.setUTCHours(0, 0, 0, 0);
    date.setUTCDate(date.getUTCDate() - i);
    const key = date.toISOString().slice(0, 10);
    const row = byDate.get(key);

    series.push({
      date: key,
      revenue: row?.revenue ?? 0,
      revenueLabel: formatINR(row?.revenue ?? 0),
      orders: row?.orders ?? 0,
    });
  }

  return series;
}

export const vendorService = {
  async dashboard(vendorId) {
    // Independent aggregations, so they run together rather than in sequence.
    const [summary, seriesRows, topProducts, inventory] = await Promise.all([
      vendorRepo.summary(vendorId),
      vendorRepo.revenueSeries(vendorId, DAYS),
      vendorRepo.topProducts(vendorId),
      vendorRepo.inventory(vendorId),
    ]);

    const series = densify(seriesRows, DAYS);
    const windowRevenue = series.reduce((total, day) => total + day.revenue, 0);
    const averageOrderValue =
      summary.orderCount > 0 ? Math.round(summary.revenue / summary.orderCount) : 0;

    return {
      revenue: {
        total: summary.revenue,
        totalLabel: formatINR(summary.revenue),
        window: windowRevenue,
        windowLabel: formatINR(windowRevenue),
        windowDays: DAYS,
      },
      orders: {
        count: summary.orderCount,
        unitsSold: summary.unitsSold,
        averageValue: averageOrderValue,
        averageValueLabel: formatINR(averageOrderValue),
        byStatus: summary.byStatus,
      },
      inventory: {
        ...inventory,
        stockValueLabel: formatINR(inventory.stockValue),
        lowStockItems: inventory.lowStockItems.map((item) => ({
          _id: item._id,
          title: item.title,
          stock: item.stock,
          image: item.images?.[0],
          priceLabel: formatINR(item.price),
        })),
      },
      topProducts: topProducts.map((product) => ({
        productId: product._id,
        title: product.title,
        image: product.image,
        units: product.units,
        revenue: product.revenue,
        revenueLabel: formatINR(product.revenue),
      })),
      series,
    };
  },
};
