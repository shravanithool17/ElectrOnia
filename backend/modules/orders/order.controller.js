import { asyncHandler } from '../../lib/asyncHandler.js';
import { orderService } from './order.service.js';

export const orderController = {
  place: asyncHandler(async (req, res) => {
    const order = await orderService.place(req.user, req.body);
    res.status(201).json({ message: 'Order placed', order });
  }),

  mine: asyncHandler(async (req, res) => {
    res.json(await orderService.listForCustomer(req.user.id));
  }),

  forVendor: asyncHandler(async (req, res) => {
    res.json(await orderService.listForVendor(req.user.id));
  }),

  updateStatus: asyncHandler(async (req, res) => {
    const order = await orderService.updateStatus(req.params.id, req.body.status, req.user);
    res.json({ message: 'Status updated', order });
  }),
};
