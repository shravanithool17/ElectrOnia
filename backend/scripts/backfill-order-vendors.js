// scripts/backfill-order-vendors.js — attach vendors and packages to old orders.
//
//   npm run orders:backfill              show what would change (no writes)
//   npm run orders:backfill -- --apply   make the changes
//
// WHY THIS EXISTS
//
// Two things left existing orders unshippable:
//
//   1. The checkout copied each line's vendor from a cart field that was never
//      set, so every order it created has lines with no vendor and an empty
//      vendor list. No vendor dashboard shows them, and nobody can ship them.
//   2. Orders from before packages existed have no packages at all.
//
// For each such order this looks up each line's product, takes the vendor the
// product belongs to NOW, and writes it onto the line, the order's vendor
// list, and a freshly built set of packages.
//
// PREREQUISITE: the products must belong to a vendor. Catalogue products
// seeded without --vendor belong to nobody, so there is nothing to copy.
// Attach them first — this keeps their ids, so carts and orders stay intact:
//
//   npm run seed -- --force --vendor <your vendor's company id>
//
// Safe to run repeatedly: an order that already has vendors on every line and
// a set of packages is left alone.
import mongoose from 'mongoose';

import { env } from '../config/env.js';
import { groupIntoFulfillments } from '../lib/fulfillment.js';
import Order from '../model/order.model.js';
import Product from '../model/product.model.js';

const apply = process.argv.includes('--apply');

await mongoose.connect(env.mongoUri);

const candidates = await Order.find({
  $or: [
    { 'items.companyId': { $in: [null] } },
    { fulfillments: { $exists: false } },
    { fulfillments: { $size: 0 } },
  ],
}).lean();

const productIds = [...new Set(candidates.flatMap((o) => o.items.map((i) => String(i.productId))))];
const owners = new Map(
  (await Product.find({ _id: { $in: productIds } }, { companyId: 1 }).lean()).map((p) => [
    String(p._id),
    p.companyId ?? null,
  ])
);

let fixed = 0;
let stillOrphaned = 0;

for (const order of candidates) {
  const items = order.items.map((item) => ({
    ...item,
    companyId: item.companyId ?? owners.get(String(item.productId)) ?? null,
  }));

  const orphans = items.filter((item) => !item.companyId).length;
  if (orphans) stillOrphaned += 1;

  const vendorIds = [...new Set(items.map((i) => i.companyId).filter(Boolean).map(String))];
  const hasPackages = order.fulfillments?.length > 0;

  // Rebuild packages only when they do not exist yet. An order whose packages
  // exist has shipping history in them, which must not be thrown away.
  const set = { items };
  if (!hasPackages) set.fulfillments = groupIntoFulfillments(items);

  console.log(
    `${apply ? 'fixing ' : 'would fix'} ${String(order._id)}  ` +
      `${order.status.padEnd(16)} lines ${items.length - orphans}/${items.length} with a vendor` +
      `${hasPackages ? '' : ', packages built'}`
  );

  if (apply) {
    await Order.updateOne(
      { _id: order._id },
      { $set: set, $addToSet: { vendorIds: { $each: vendorIds.map((id) => new mongoose.Types.ObjectId(id)) } } }
    );
  }
  fixed += 1;
}

console.log(`\n${candidates.length} order(s) needed attention; ${fixed} ${apply ? 'fixed' : 'would be fixed'}.`);

if (stillOrphaned) {
  console.log(
    `\n⚠️  ${stillOrphaned} order(s) have lines whose product belongs to no vendor.\n` +
      '   Nobody but an admin can ship those. Attach the products to a vendor first:\n' +
      '     npm run seed -- --force --vendor <company id>\n' +
      '   then run this again.'
  );
}

if (!apply && candidates.length) console.log('\nNothing was written. Re-run with --apply to make these changes.');

await mongoose.disconnect();
