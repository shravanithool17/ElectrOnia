import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { optionalAuth, requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { cartController } from './cart.controller.js';
import {
  addItemSchema,
  itemParamSchema,
  updateItemSchema,
  mergeSchema,
  couponSchema,
} from './cart.schema.js';

export const cartRoutes = Router();

// optionalAuth, not requireAuth: a guest builds a cart before signing in, and
// gets it merged on login.
cartRoutes.use(optionalAuth);

cartRoutes.get('/', cartController.get);
cartRoutes.post('/items', validate(addItemSchema), cartController.addItem);
cartRoutes.patch('/items/:productId', validate(updateItemSchema), cartController.updateItem);
cartRoutes.delete('/items/:productId', validate(itemParamSchema), cartController.removeItem);
cartRoutes.post(
  '/items/:productId/save-for-later',
  validate(itemParamSchema),
  cartController.toggleSaveForLater
);
cartRoutes.delete('/', cartController.clear);

cartRoutes.post('/coupon', validate(couponSchema), cartController.applyCoupon);
cartRoutes.delete('/coupon', cartController.removeCoupon);

// Merging requires a signed-in customer — it writes into their cart.
cartRoutes.post(
  '/merge',
  requireAuth,
  requireRole(ROLES.CUSTOMER),
  validate(mergeSchema),
  cartController.merge
);
