// scripts/migrate-money-to-paise.js
//
//   npm run migrate:paise            # apply
//   npm run migrate:paise -- --dry   # report only, change nothing
//
// Converts existing rupee-valued money fields to integer paise
// (₹2,499 → 249900) across products and orders.
//
// Idempotent by marker, not by guesswork: a `migrations` collection records
// that this ran. Inferring "has this already been converted?" from the values
// themselves is unreliable — 249900 is a legitimate rupee amount too — so the
// marker is the only safe guard, and running twice is a no-op.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import Product from '../model/product.model.js';
import Order from '../model/order.model.js';

const NAME = '001-money-to-paise';
const dryRun = process.argv.includes('--dry');

async function main() {
  await mongoose.connect(env.mongoUri);
  const migrations = mongoose.connection.db.collection('migrations');

  const already = await migrations.findOne({ name: NAME });
  if (already) {
    console.log(`✓ ${NAME} already applied on ${already.appliedAt.toISOString()} — nothing to do.`);
    return;
  }

  const productCount = await Product.countDocuments();
  const orderCount = await Order.countDocuments();
  console.log(`Found ${productCount} products and ${orderCount} orders.`);

  if (dryRun) {
    const sample = await Product.findOne().lean();
    if (sample) {
      console.log(
        `Dry run — example: "${sample.title}" price ${sample.price} → ${sample.price * 100}`
      );
    }
    console.log('Dry run complete. No documents were changed.');
    return;
  }

  // Products: price and originalPrice.
  const products = await Product.updateMany({}, [
    {
      $set: {
        price: { $round: [{ $multiply: ['$price', 100] }, 0] },
        originalPrice: {
          $cond: [
            { $ifNull: ['$originalPrice', false] },
            { $round: [{ $multiply: ['$originalPrice', 100] }, 0] },
            '$originalPrice',
          ],
        },
      },
    },
  ]);
  console.log(`Products updated: ${products.modifiedCount}`);

  // Orders: the total and every line price.
  const orders = await Order.updateMany({}, [
    {
      $set: {
        totalAmount: { $round: [{ $multiply: ['$totalAmount', 100] }, 0] },
        items: {
          $map: {
            input: '$items',
            as: 'item',
            in: {
              $mergeObjects: [
                '$$item',
                { price: { $round: [{ $multiply: ['$$item.price', 100] }, 0] } },
              ],
            },
          },
        },
      },
    },
  ]);
  console.log(`Orders updated: ${orders.modifiedCount}`);

  await migrations.insertOne({
    name: NAME,
    appliedAt: new Date(),
    productsModified: products.modifiedCount,
    ordersModified: orders.modifiedCount,
  });

  console.log(`✓ ${NAME} applied.`);
}

main()
  .catch((err) => {
    console.error('Migration failed:', err.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
