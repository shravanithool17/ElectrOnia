// lib/seed.js — catalogue seeding.
//
//   npm run seed                  insert only if the collection is empty
//   npm run seed -- --force       refresh the catalogue IN PLACE (ids kept)
//   npm run seed -- --wipe        delete every product and reinsert (new ids —
//                                 breaks every cart, order link and wishlist)
//   npm run seed -- --vendor <id> assign all seeded products to that vendor
//   npm run seed -- --force --vendor 66f1a...   both
//
// WHY --force NO LONGER DELETES
//
// It used to deleteMany() and insertMany(), which gives every product a NEW
// _id. Everything that points at a product by id — cart lines, wishlist
// entries, order items — then points at nothing. The cart shows those lines as
// "Unavailable product", the checkout prices zero of them, and the customer is
// told their cart is empty while the drawer plainly shows items. Reseeding is
// something you do often in development, so it was a trap you walked into
// every time.
//
// --force now upserts by title: existing products keep their _id and get the
// new price, stock, images and specs; new products are inserted; nothing is
// deleted. --wipe keeps the old destructive behaviour for when you mean it.
//
// seedIfEmpty() also runs on boot (unless SEED_ON_BOOT=false) so a fresh
// clone is never staring at an empty store.
//
// The product data itself lives in catalogue.data.js.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import Product from '../model/product.model.js';
import Coupon from '../model/coupon.model.js';
import { CATALOGUE, CATALOGUE_STATS } from './catalogue.data.js';
import { COUPONS } from './coupons.data.js';

export function parseArgs(argv) {
  const vendorIndex = argv.indexOf('--vendor');
  const vendorId = vendorIndex > -1 ? argv[vendorIndex + 1] : null;

  if (vendorId && !mongoose.Types.ObjectId.isValid(vendorId)) {
    throw new Error(`--vendor expects a valid ObjectId, got "${vendorId}"`);
  }

  return { force: argv.includes('--force'), wipe: argv.includes('--wipe'), vendorId };
}

/**
 * @param {{force?: boolean, wipe?: boolean, vendorId?: string|null}} options
 */
export async function seedCatalogue({ force = false, wipe = false, vendorId = null } = {}) {
  const existing = await Product.countDocuments();

  if (existing > 0 && !force && !wipe) {
    logger.info(
      `Catalogue already has ${existing} products — skipping seed. ` +
        'Use --force to refresh it in place (ids kept), or --wipe to replace it (new ids).'
    );
    return { inserted: 0, updated: 0, deleted: 0, skipped: true };
  }

  const documents = vendorId
    ? CATALOGUE.map((product) => ({ ...product, companyId: new mongoose.Types.ObjectId(vendorId) }))
    : CATALOGUE;

  // --------------------------------------------------- destructive: --wipe
  if (wipe) {
    const { deletedCount } = await Product.deleteMany({});
    logger.warn(
      `Deleted ${deletedCount} products (--wipe). Every product now has a NEW id: ` +
        'existing cart lines, wishlist entries and order links will point at nothing.'
    );
    const inserted = await Product.insertMany(documents);
    logSummary(inserted.length, 0, vendorId);
    return { inserted: inserted.length, updated: 0, deleted: deletedCount, skipped: false };
  }

  // ------------------------------------------- in place: --force or empty
  // One round trip for the whole catalogue. Matching on title is safe
  // because titles are unique in catalogue.data.js (a test enforces it).
  const result = await Product.bulkWrite(
    documents.map((product) => ({
      updateOne: {
        filter: { title: product.title },
        update: { $set: product },
        upsert: true,
      },
    })),
    { ordered: false }
  );

  const inserted = result.upsertedCount ?? 0;
  const updated = result.modifiedCount ?? 0;
  logSummary(inserted, updated, vendorId);
  return { inserted, updated, deleted: 0, skipped: false };
}

function logSummary(inserted, updated, vendorId) {
  logger.info(
    `Catalogue: ${inserted} inserted, ${updated} updated (ids preserved) — ` +
      `${CATALOGUE_STATS.categories} categories, ${CATALOGUE_STATS.brands} brands, ` +
      `${CATALOGUE_STATS.featured} featured, ${CATALOGUE_STATS.lowStock} low stock, ` +
      `${CATALOGUE_STATS.outOfStock} out of stock` +
      (vendorId ? `, owned by vendor ${vendorId}` : ', with no vendor assigned')
  );

  if (!vendorId) {
    logger.info(
      'Tip: re-run with --vendor <companyId> to attach these to a vendor account, ' +
        'so the vendor dashboard has products and orders to show.'
    );
  }
}

/**
 * Coupons are upserted by code rather than inserted, so re-running the seed
 * refreshes their terms without creating duplicates or wiping redemptions.
 */
export async function seedCoupons() {
  const results = await Promise.all(
    COUPONS.map((coupon) =>
      Coupon.updateOne({ code: coupon.code }, { $set: coupon }, { upsert: true })
    )
  );

  const created = results.filter((r) => r.upsertedCount > 0).length;
  logger.info(`Coupons: ${created} created, ${results.length - created} updated (${COUPONS.map((c) => c.code).join(', ')}).`);
  return { created, total: results.length };
}

/** Called on boot. Never destructive. */
export async function seedIfEmpty() {
  try {
    const result = await seedCatalogue({ force: false });
    await seedCoupons();
    return result;
  } catch (err) {
    logger.error({ err: err.message }, 'Seed failed');
    return { inserted: 0, deleted: 0, skipped: true };
  }
}

// `npm run seed` runs this file directly.
const isDirectRun = process.argv[1] && process.argv[1].endsWith('seed.js');

if (isDirectRun) {
  const options = parseArgs(process.argv.slice(2));

  await mongoose.connect(env.mongoUri);
  await seedCatalogue(options);
  await seedCoupons();
  // Indexes are declared on the model; build them now so the first catalogue
  // query after a seed is already index-backed.
  await Product.syncIndexes();
  await mongoose.disconnect();
  process.exit(0);
}
