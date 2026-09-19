import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { checkoutController } from './checkout.controller.js';
import { quoteSchema, placeOrderSchema } from './checkout.schema.js';

export const checkoutRoutes = Router();

// Checkout is signed-in only: it needs an address book and an order owner.
checkoutRoutes.use(requireAuth, requireRole(ROLES.CUSTOMER));

checkoutRoutes.post('/quote', validate(quoteSchema), checkoutController.quote);
checkoutRoutes.post('/place-order', validate(placeOrderSchema), checkoutController.placeOrder);
