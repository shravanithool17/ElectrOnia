// modules/checkout/checkout.service.js
//
// Two entry points over the same pricing:
//
//   quote()      — reads the cart, prices it, writes nothing. Safe to call on
//                  every keystroke of the checkout form.
//   placeOrder() — reserves stock, creates the order, redeems the coupon and
//                  empties the cart.
//
// Prices, tax, shipping and discount all come from lib/pricing.js, the same
// module the cart uses, so the checkout total can never disagree with the cart.
import { env } from '../../config/env.js';
import { AppError, ConflictError } from '../../lib/errors.js';
import { sendInBackground, templates } from '../../lib/mailer.js';
import { formatINR } from '../../lib/money.js';
import { priceOrder, amountToFreeShipping } from '../../lib/pricing.js';
import { productRepo } from '../catalog/product.repo.js';
import { orderRepo } from '../orders/order.repo.js';
import { toOrderDto } from '../orders/order.dto.js';
import { cartService } from '../cart/cart.service.js';
import { cartRepo } from '../cart/cart.repo.js';
import { addressService } from '../addresses/address.service.js';
import { couponService } from './coupon.service.js';
import { paymentService } from '../payments/payment.service.js';
import { groupIntoFulfillments } from '../../lib/fulfillment.js';

const money = (paise) => ({ amount: paise, label: formatINR(paise) });

/**
 * "Your cart is empty" used to be the answer to three different situations,
 * and two of them are not an empty cart at all:
 *
 *   CART_EMPTY              nothing in it
 *   CART_ONLY_SAVED         everything is under "saved for later"
 *   CART_ONLY_UNAVAILABLE   every line is out of stock or no longer exists —
 *                           which is what a catalogue reseed used to do to
 *                           every cart, because it reissued every product id
 *
 * The drawer showed the lines in the last two cases, so being told the cart
 * was empty read as a bug. Each case now has its own code and a message that
 * names what to do; `details` carries the counts the page needs to say so.
 */
async function loadPricedCart(owner) {
  const { cart, chargeable, dto } = await cartService.getChargeable(owner);

  if (chargeable.length === 0) {
    const active = dto?.items ?? [];
    const saved = dto?.savedForLater ?? [];
    const unavailable = active.filter((line) => line.unavailable);
    const details = { active: active.length, saved: saved.length, unavailable: unavailable.length };

    if (unavailable.length > 0) {
      throw new AppError(
        422,
        'CART_ONLY_UNAVAILABLE',
        unavailable.length === 1
          ? 'The item in your cart is no longer available. Remove it and add something in stock.'
          : `The ${unavailable.length} items in your cart are no longer available. Remove them and add something in stock.`,
        details
      );
    }

    if (saved.length > 0) {
      throw new AppError(
        422,
        'CART_ONLY_SAVED',
        `Everything in your cart is saved for later (${saved.length} ${saved.length === 1 ? 'item' : 'items'}). Move something back to the cart to check out.`,
        details
      );
    }

    throw new AppError(422, 'CART_EMPTY', 'Your cart is empty.', details);
  }

  let coupon = null;
  if (cart.couponCode) {
    const resolved = await couponService.resolve(cart.couponCode, owner.userId);
    coupon = resolved.coupon;
  }

  const totals = priceOrder(
    chargeable.map((line) => ({ unitPrice: line.unitPrice, quantity: line.quantity })),
    coupon
  );

  return { cart, chargeable, coupon, totals };
}

/**
 * Conditional atomic decrement per line: the update only applies while stock
 * is still at least the requested quantity, so two simultaneous orders cannot
 * both take the last unit. Across lines this is not one transaction, so a
 * later failure compensates the earlier decrements.
 *
 * A multi-document transaction is the stronger guarantee and Atlas supports
 * it; this function is the seam where that swap happens.
 */
async function reserveStock(lines) {
  const reserved = [];

  for (const line of lines) {
    const updated = await productRepo.reserveStock(line.productId, line.quantity);
    if (!updated) {
      await Promise.all(
        reserved.map((r) => productRepo.releaseStock(r.productId, r.quantity))
      );
      return { ok: false, failedOn: line };
    }
    reserved.push(line);
  }

  return { ok: true };
}

export const checkoutService = {
  /** Priced preview. No writes, so it is safe to poll. */
  async quote(owner, addressId = null) {
    const { chargeable, totals, cart } = await loadPricedCart(owner);

    let address = null;
    let addressError = null;
    try {
      address = await addressService.resolveForCheckout(owner.userId, addressId);
    } catch (err) {
      addressError = err.message;
    }

    return {
      items: chargeable.map((line) => ({
        productId: line.productId,
        title: line.title,
        image: line.image,
        quantity: line.quantity,
        unitPrice: line.unitPrice,
        unitPriceLabel: formatINR(line.unitPrice),
        lineTotal: line.unitPrice * line.quantity,
        lineTotalLabel: formatINR(line.unitPrice * line.quantity),
      })),
      address,
      addressError,
      couponCode: cart.couponCode,
      summary: {
        itemsSubtotal: money(totals.itemsSubtotal),
        discountTotal: money(totals.discountTotal),
        taxTotal: money(totals.taxTotal),
        shippingTotal: money(totals.shippingTotal),
        grandTotal: money(totals.grandTotal),
        freeShipping: totals.freeShipping,
        amountToFreeShipping: money(amountToFreeShipping(totals.itemsSubtotal)),
        appliedCoupon: totals.appliedCoupon,
        couponError: totals.couponError,
      },
      payableNow: money(totals.grandTotal),
    };
  },

  async placeOrder(user, { addressId = null, paymentMethod = 'COD' } = {}) {
    // An online order is NOT complete when it is created — the money has not
    // arrived. It is created in PendingPayment with its stock reserved, and
    // the payments module moves it to Processing when the provider confirms.
    // Cash on delivery has nothing to wait for, so it goes straight through.
    const isOnline = paymentMethod === 'Razorpay';
    const owner = { userId: user.id };

    // A previous unpaid attempt by this customer is cancelled and its stock
    // returned BEFORE this one reserves. Otherwise retrying after closing the
    // Razorpay window competes with your own abandoned order for the same
    // units — and on a low-stock item, loses.
    if (isOnline) await paymentService.supersedePendingOrders(user.id);

    const { cart, chargeable, coupon, totals } = await loadPricedCart(owner);

    const address = await addressService.resolveForCheckout(user.id, addressId);

    const reservation = await reserveStock(chargeable);
    if (!reservation.ok) {
      throw new ConflictError(
        'INSUFFICIENT_STOCK',
        `Not enough stock for "${reservation.failedOn.title}". Please reduce the quantity.`,
        { productId: reservation.failedOn.productId }
      );
    }

    try {
      const order = await orderRepo.create({
        customerId: user.id,
        customerName: user.name,
        customerEmail: user.email,
        items: chargeable.map((line) => ({
          productId: line.productId,
          title: line.title,
          price: line.unitPrice,
          quantity: line.quantity,
          image: line.image,
          companyId: line.companyId,
        })),
        totalAmount: totals.grandTotal,
        amounts: {
          itemsSubtotal: totals.itemsSubtotal,
          discountTotal: totals.discountTotal,
          taxTotal: totals.taxTotal,
          shippingTotal: totals.shippingTotal,
          grandTotal: totals.grandTotal,
        },
        couponCode: totals.appliedCoupon,
        addressId: address._id,
        // Snapshotted, not referenced.
        shippingAddress: {
          street: [address.line1, address.line2].filter(Boolean).join(', '),
          city: address.city,
          zipCode: address.pincode,
          phone: address.phone,
        },
        paymentMethod,
        status: isOnline ? 'PendingPayment' : 'Processing',
        payment: isOnline
          ? { status: 'Pending', provider: 'razorpay' }
          : { status: 'NotRequired' },
        statusHistory: [
          {
            status: isOnline ? 'PendingPayment' : 'Processing',
            at: new Date(),
            byRole: 'system',
            note: isOnline ? 'Awaiting payment. Stock is reserved.' : undefined,
          },
        ],
        vendorIds: [
          ...new Set(chargeable.map((l) => l.companyId).filter(Boolean).map(String)),
        ],
        // One package per vendor, each shipped and tracked on its own.
        fulfillments: groupIntoFulfillments(chargeable),
      });

      // Cash on delivery is bought the moment it is ordered, so the coupon is
      // spent and the cart cleared now.
      //
      // An ONLINE order is not bought until the money arrives. Doing either of
      // these here meant closing the Razorpay window left the customer with
      // an empty cart and a used single-use coupon, for an order that never
      // happened. payment.service markPaid() does both once payment is
      // confirmed.
      if (!isOnline) {
        if (coupon && totals.discountTotal > 0) {
          await couponService.redeem({
            code: coupon.code,
            userId: user.id,
            orderId: order._id,
            discountAmount: totals.discountTotal,
          });
        }

        // Only the purchased lines are cleared — anything saved for later stays.
        cart.items = cart.items.filter((item) => item.savedForLater);
        cart.couponCode = null;
        await cartRepo.save(cart);
      }

      const dto = toOrderDto(order.toObject());

      // Only for orders that are actually done. An online order is not
      // confirmed until the provider says so, and payment.service.js sends
      // this same email at that point — sending here too would mean two
      // receipts for one order, the first of them untrue.
      if (!isOnline) sendInBackground(
        {
          to: user.email,
          ...templates.orderPlaced({
            name: user.name,
            orderId: order._id,
            items: chargeable.map((line) => ({
              title: line.title,
              quantity: line.quantity,
              lineTotalLabel: formatINR(line.unitPrice * line.quantity),
            })),
            totalLabel: formatINR(totals.grandTotal),
            address: [address.line1, address.line2, address.city, address.state, address.pincode]
              .filter(Boolean)
              .join(', '),
            appUrl: env.appUrl,
          }),
        },
        { orderId: String(order._id), kind: 'order-placed' }
      );

      return dto;
    } catch (err) {
      // The order failed after stock was taken — put it back.
      await Promise.all(
        chargeable.map((l) => productRepo.releaseStock(l.productId, l.quantity))
      );
      throw err;
    }
  },
};
