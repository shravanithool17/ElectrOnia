// modules/orders/order.service.js
//
// The one route in the system where a bug costs money, so the rules are
// explicit:
//   * prices come from the database, never from the request
//   * stock is validated and reserved atomically
//   * a failure after reservation puts the stock back
import { ConflictError, NotFoundError, ValidationError } from '../../lib/errors.js';
import { lineTotal, sum } from '../../lib/money.js';
import { productRepo } from '../catalog/product.repo.js';
import { orderRepo } from './order.repo.js';
import { toOrderDto, toOrderDtos, toOrderDtoFor } from './order.dto.js';
import { fulfillmentService } from '../fulfillment/fulfillment.service.js';
import { groupIntoFulfillments } from '../../lib/fulfillment.js';
import { VENDOR_VISIBLE_ORDER } from '../../model/order.model.js';
import { ROLES } from '../../middleware/auth.js';

/**
 * Collapses duplicate lines so the same product twice in a cart becomes one
 * line with a summed quantity — otherwise stock is checked twice against the
 * same figure.
 */
function collapseItems(items) {
  const wanted = new Map();
  for (const item of items) {
    const id = String(item.productId ?? item._id);
    wanted.set(id, (wanted.get(id) ?? 0) + item.quantity);
  }
  return wanted;
}

/**
 * Reserves stock line by line with a conditional atomic update. Each update is
 * atomic for its own document, so two simultaneous orders cannot both take the
 * last unit. Across documents this is not one transaction, so a later failure
 * compensates the earlier decrements.
 *
 * A multi-document transaction (session.withTransaction) is the stronger
 * guarantee and Atlas supports it; this function is the seam where that swap
 * happens. See docs/roadmap.md, Phase 1.
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

async function releaseAll(lines) {
  await Promise.all(lines.map((l) => productRepo.releaseStock(l.productId, l.quantity)));
}

export const orderService = {
  async place(user, { items, shippingAddress, paymentMethod }) {
    const wanted = collapseItems(items);

    const products = await productRepo.findManyByIds([...wanted.keys()]);
    if (products.length !== wanted.size) {
      throw new ValidationError('One or more products are no longer available');
    }

    // Prices and titles are read from the database. The client used to send
    // totalAmount, which meant a ₹2,499 laptop could be ordered for ₹1 by
    // editing the request body.
    const lines = products.map((product) => ({
      productId: product._id,
      title: product.title,
      price: product.price,
      quantity: wanted.get(String(product._id)),
      image: product.images?.[0],
      companyId: product.companyId,
    }));

    const totalAmount = sum(lines.map((line) => lineTotal(line.price, line.quantity)));

    const reservation = await reserveStock(lines);
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
        items: lines,
        totalAmount,
        shippingAddress,
        paymentMethod: paymentMethod ?? 'COD',
        status: 'Processing',
        statusHistory: [{ status: 'Processing', at: new Date(), byRole: 'system' }],
        vendorIds: [...new Set(lines.map((l) => l.companyId).filter(Boolean).map(String))],
        fulfillments: groupIntoFulfillments(lines),
      });

      return toOrderDto(order.toObject());
    } catch (err) {
      // The order failed after stock was taken — put it back.
      await releaseAll(lines);
      throw err;
    }
  },

  async listForCustomer(customerId) {
    return toOrderDtos(await orderRepo.findForCustomer(customerId));
  },

  /**
   * A vendor sees their own lines only — not what the customer bought
   * elsewhere. They get the shipping address because they have to ship it.
   */
  async listForVendor(vendorId) {
    const orders = await orderRepo.findForVendor(vendorId);
    return orders.map((order) => toOrderDtoFor(order, { id: vendorId, role: 'vendor' }));
  },

  /**
   * The legacy "set a status" call, mapped onto the package state machine.
   * Shipped needs a courier and tracking number, which a bare status cannot
   * carry — so that one is refused with directions, not guessed at.
   */
  async updateStatus(orderId, status, user) {
    const filter =
      user.role === ROLES.ADMIN
        ? { _id: orderId, ...VENDOR_VISIBLE_ORDER }
        : { _id: orderId, vendorIds: user.id, ...VENDOR_VISIBLE_ORDER };

    const order = await orderRepo.updateStatus(filter, status, user.role);
    if (!order) throw new NotFoundError('Order not found');
    return toOrderDto(order.toObject());
  },
};
