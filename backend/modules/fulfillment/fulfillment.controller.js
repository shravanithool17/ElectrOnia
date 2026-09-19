// modules/fulfillment/fulfillment.controller.js — HTTP only.
import { asyncHandler } from '../../lib/asyncHandler.js';
import { toOrderDtoFor } from '../orders/order.dto.js';
import { fulfillmentService } from './fulfillment.service.js';

// Each response is the order as the CALLER may see it: a vendor gets their
// own package and lines, not the other vendors'.
const reply = (res, req, order, message) => res.json({ message, order: toOrderDtoFor(order.toObject(), req.user) });

export const fulfillmentController = {
  ship: asyncHandler(async (req, res) =>
    reply(res, req, await fulfillmentService.ship(req.user, req.params.id, req.body), 'Marked as shipped')
  ),

  outForDelivery: asyncHandler(async (req, res) =>
    reply(res, req, await fulfillmentService.outForDelivery(req.user, req.params.id, req.body), 'Marked out for delivery')
  ),

  deliver: asyncHandler(async (req, res) =>
    reply(res, req, await fulfillmentService.deliver(req.user, req.params.id, req.body), 'Marked as delivered')
  ),

  cancelPackage: asyncHandler(async (req, res) =>
    reply(res, req, await fulfillmentService.cancelPackage(req.user, req.params.id, req.body), 'Package cancelled')
  ),

  cancelByCustomer: asyncHandler(async (req, res) =>
    reply(res, req, await fulfillmentService.cancelByCustomer(req.user, req.params.id, req.body), 'Order cancelled')
  ),
};
