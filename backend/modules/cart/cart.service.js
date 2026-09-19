// modules/cart/cart.service.js
//
// The cart is authoritative on the server. Two rules make the rest fall out:
//
//   1. The client sends only productId and quantity. Prices are read from the
//      database on every single request.
//   2. Nothing is silently changed. A price move, a stock drop or a delisting
//      is reported as a notice, and the customer decides.
import { NotFoundError, ConflictError, ValidationError } from '../../lib/errors.js';
import { formatINR } from '../../lib/money.js';
import { priceOrder } from '../../lib/pricing.js';
import { productRepo } from '../catalog/product.repo.js';
import { couponService } from '../checkout/coupon.service.js';
import { cartRepo } from './cart.repo.js';
import { toCartDto } from './cart.dto.js';

const MAX_LINES = 50;

/**
 * Loads the cart, re-prices it against live products, and builds the notices.
 * Every read and every mutation funnels through here, so the shape the client
 * receives is identical whatever the caller did.
 */
async function hydrate(owner, { persistSnapshots = true, adjustQuantities = true } = {}) {
  const cart = await cartRepo.findOrCreate(owner);

  if (cart.items.length === 0) {
    return { cart, dto: build({ lines: [], savedLines: [], couponCode: null, notices: [] }) };
  }

  // One query for every product in the cart — never one per line.
  const products = await productRepo.findManyByIds(cart.items.map((item) => item.productId));
  const byId = new Map(products.map((product) => [String(product._id), product]));

  const notices = [];
  let snapshotsChanged = false;

  const hydrated = cart.items.map((item) => {
    const product = byId.get(String(item.productId));

    // Delisted since it was added. Kept in the cart and flagged, not deleted —
    // silently removing something is the behaviour customers complain about.
    if (!product) {
      notices.push({
        code: 'PRODUCT_UNAVAILABLE',
        productId: item.productId,
        message: 'An item in your cart is no longer available.',
      });
      return {
        productId: item.productId,
        title: 'Unavailable product',
        quantity: item.quantity,
        unitPrice: item.priceSnapshot,
        available: 0,
        unavailable: true,
        savedForLater: item.savedForLater,
        priceChanged: null,
      };
    }

    let priceChanged = null;
    if (product.price !== item.priceSnapshot) {
      priceChanged = {
        from: item.priceSnapshot,
        fromLabel: formatINR(item.priceSnapshot),
        to: product.price,
        toLabel: formatINR(product.price),
        direction: product.price > item.priceSnapshot ? 'up' : 'down',
      };

      // A rise must be shown. A drop is good news and applies silently — the
      // customer is charged the lower price either way.
      if (priceChanged.direction === 'up') {
        notices.push({
          code: 'PRICE_INCREASED',
          productId: product._id,
          message: `${product.title} went from ${priceChanged.fromLabel} to ${priceChanged.toLabel}.`,
        });
      }

      item.priceSnapshot = product.price;
      item.snapshotAt = new Date();
      snapshotsChanged = true;
    }

    const outOfStock = product.stock <= 0;
    const overStock = !outOfStock && item.quantity > product.stock;

    if (outOfStock) {
      notices.push({
        code: 'OUT_OF_STOCK',
        productId: product._id,
        message: `${product.title} is out of stock.`,
      });
    } else if (overStock) {
      notices.push({
        code: 'QUANTITY_REDUCED',
        productId: product._id,
        message: `Only ${product.stock} of ${product.title} left — quantity reduced.`,
      });
      if (adjustQuantities) {
        item.quantity = product.stock;
        snapshotsChanged = true;
      }
    }

    return {
      productId: product._id,
      title: product.title,
      image: product.images?.[0],
      brand: product.brand,
      quantity: item.quantity,
      unitPrice: product.price,
      available: product.stock,
      unavailable: outOfStock,
      savedForLater: item.savedForLater,
      priceChanged,
      // Who sells it. Checkout copies this onto each order line and builds
      // the order's vendor list from it. It was missing, so every order placed
      // through this checkout had no vendor at all: it never appeared on any
      // vendor's dashboard, and nobody could ship it.
      companyId: product.companyId ?? null,
    };
  });

  if (snapshotsChanged && persistSnapshots) await cartRepo.save(cart);

  // Only active, in-stock lines are priced. Saved-for-later and unavailable
  // lines are shown but never charged.
  const lines = hydrated.filter((line) => !line.savedForLater);
  const savedLines = hydrated.filter((line) => line.savedForLater);
  const chargeable = lines.filter((line) => !line.unavailable);

  let coupon = null;
  if (cart.couponCode) {
    const result = await couponService.resolve(cart.couponCode, owner.userId);
    if (result.coupon) {
      coupon = result.coupon;
    } else {
      notices.push({ code: 'COUPON_INVALID', message: result.reason });
      cart.couponCode = null;
      await cartRepo.save(cart);
    }
  }

  return {
    cart,
    chargeable,
    dto: build({ lines, savedLines, couponCode: cart.couponCode, notices, chargeable, coupon }),
  };
}

function build({ lines, savedLines, couponCode, notices, chargeable = [], coupon = null }) {
  const totals = priceOrder(
    chargeable.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    coupon
  );
  return toCartDto({ lines, savedLines, totals, couponCode, notices });
}

export const cartService = {
  get: async (owner) => (await hydrate(owner)).dto,

  /** The priced, chargeable lines — what checkout turns into an order. */
  getChargeable: async (owner, { adjustQuantities = false } = {}) => {
    const { cart, chargeable, dto } = await hydrate(owner, { adjustQuantities });
    return { cart, chargeable: chargeable ?? [], dto };
  },

  async addItem(owner, { productId, quantity }) {
    const product = await productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (product.stock <= 0) {
      throw new ConflictError('OUT_OF_STOCK', `${product.title} is out of stock.`);
    }

    const cart = await cartRepo.findOrCreate(owner);
    const existing = cart.items.find((item) => String(item.productId) === String(productId));

    if (!existing && cart.items.length >= MAX_LINES) {
      throw new ValidationError(`A cart holds at most ${MAX_LINES} different products.`);
    }

    const wanted = (existing && !existing.savedForLater ? existing.quantity : 0) + quantity;
    const capped = Math.min(wanted, product.stock, 20);

    if (existing) {
      existing.quantity = capped;
      existing.priceSnapshot = product.price;
      existing.snapshotAt = new Date();
      // Adding again moves it back out of "saved for later".
      existing.savedForLater = false;
    } else {
      cart.items.push({
        productId: product._id,
        quantity: capped,
        priceSnapshot: product.price,
        snapshotAt: new Date(),
      });
    }

    await cartRepo.save(cart);
    return (await hydrate(owner)).dto;
  },

  async updateQuantity(owner, productId, quantity) {
    const cart = await cartRepo.find(owner);
    const line = cart?.items.find((item) => String(item.productId) === String(productId));
    if (!line) throw new NotFoundError('That item is not in your cart');

    const product = await productRepo.findById(productId);
    if (!product) throw new NotFoundError('Product not found');
    if (quantity > product.stock) {
      throw new ConflictError(
        'INSUFFICIENT_STOCK',
        `Only ${product.stock} of ${product.title} available.`,
        { available: product.stock }
      );
    }

    line.quantity = quantity;
    await cartRepo.save(cart);
    return (await hydrate(owner)).dto;
  },

  async removeItem(owner, productId) {
    const cart = await cartRepo.find(owner);
    if (!cart) return (await hydrate(owner)).dto;

    cart.items = cart.items.filter((item) => String(item.productId) !== String(productId));
    await cartRepo.save(cart);
    return (await hydrate(owner)).dto;
  },

  /** Save for later / move back — a flag, so nothing is lost either way. */
  async toggleSaveForLater(owner, productId) {
    const cart = await cartRepo.find(owner);
    const line = cart?.items.find((item) => String(item.productId) === String(productId));
    if (!line) throw new NotFoundError('That item is not in your cart');

    line.savedForLater = !line.savedForLater;
    await cartRepo.save(cart);
    return (await hydrate(owner)).dto;
  },

  async clear(owner) {
    const cart = await cartRepo.find(owner);
    if (cart) {
      cart.items = [];
      cart.couponCode = null;
      await cartRepo.save(cart);
    }
    return (await hydrate(owner)).dto;
  },

  /**
   * Folds a guest cart into the signed-in user's cart on login. Quantities
   * are summed and capped; the guest cart is then deleted so it cannot be
   * merged twice.
   */
  async mergeGuestCart(userId, guestToken) {
    const guestCart = await cartRepo.find({ guestToken });
    if (!guestCart || guestCart.items.length === 0) {
      return (await hydrate({ userId })).dto;
    }

    const userCart = await cartRepo.findOrCreate({ userId });

    for (const guestItem of guestCart.items) {
      const existing = userCart.items.find(
        (item) => String(item.productId) === String(guestItem.productId)
      );
      if (existing) {
        existing.quantity = Math.min(20, existing.quantity + guestItem.quantity);
      } else if (userCart.items.length < MAX_LINES) {
        // A plain object, not the subdocument itself: pushing a subdocument
        // that belongs to another parent relies on Mongoose re-casting it, and
        // the guest cart it came from is deleted two lines later.
        userCart.items.push(guestItem.toObject());
      }
    }

    // Keep the guest's coupon only if the user has none of their own.
    if (!userCart.couponCode && guestCart.couponCode) {
      userCart.couponCode = guestCart.couponCode;
    }

    await cartRepo.save(userCart);
    await cartRepo.delete({ guestToken });

    return (await hydrate({ userId })).dto;
  },

  async applyCoupon(owner, code) {
    const { coupon, reason } = await couponService.resolve(code, owner.userId);
    if (!coupon) throw new ValidationError(reason, [{ field: 'code', message: reason }]);

    const cart = await cartRepo.findOrCreate(owner);
    cart.couponCode = coupon.code;
    await cartRepo.save(cart);

    const dto = (await hydrate(owner)).dto;

    // The code is valid but this cart does not qualify — say which, rather
    // than showing a coupon that quietly does nothing.
    if (dto.summary.couponError === 'MIN_ORDER_NOT_MET') {
      throw new ValidationError(
        `${coupon.code} needs a subtotal of at least ${formatINR(coupon.minOrderValue)}.`,
        [{ field: 'code', message: 'Minimum order value not met' }]
      );
    }

    return dto;
  },

  async removeCoupon(owner) {
    const cart = await cartRepo.findOrCreate(owner);
    cart.couponCode = null;
    await cartRepo.save(cart);
    return (await hydrate(owner)).dto;
  },
};
