import { asyncHandler } from '../../lib/asyncHandler.js';
import { checkoutService } from './checkout.service.js';

export const checkoutController = {
  quote: asyncHandler(async (req, res) => {
    res.json(await checkoutService.quote({ userId: req.user.id }, req.body.addressId ?? null));
  }),

  placeOrder: asyncHandler(async (req, res) => {
    const order = await checkoutService.placeOrder(req.user, req.body);
    res.status(201).json({ message: 'Order placed', order, _id: order._id });
  }),
};
