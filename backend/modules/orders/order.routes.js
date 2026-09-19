import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { orderController } from './order.controller.js';
import { createOrderSchema, updateStatusSchema } from './order.schema.js';
import { fulfillmentController } from '../fulfillment/fulfillment.controller.js';
import {
  shipSchema,
  stepSchema,
  cancelPackageSchema,
  cancelOrderSchema,
} from '../fulfillment/fulfillment.schema.js';

export const orderRoutes = Router();

orderRoutes.post(
  '/',
  requireAuth,
  requireRole(ROLES.CUSTOMER),
  validate(createOrderSchema),
  orderController.place
);

// Both spellings are live: the second is what the current frontend calls, and
// it keeps working until the client migrates to /v1.
orderRoutes.get('/mine', requireAuth, requireRole(ROLES.CUSTOMER), orderController.mine);
orderRoutes.get('/my-orders', requireAuth, requireRole(ROLES.CUSTOMER), orderController.mine);

orderRoutes.get('/vendor', requireAuth, requireRole(ROLES.VENDOR), orderController.forVendor);
orderRoutes.get('/vendor-orders', requireAuth, requireRole(ROLES.VENDOR), orderController.forVendor);

// ---------------------------------------------------- shipping & delivery
// A vendor acts on THEIR package in an order; an admin on any. The customer
// can cancel the whole order while nothing has shipped.
const seller = [requireAuth, requireRole(ROLES.VENDOR, ROLES.ADMIN)];

orderRoutes.post('/:id/ship', ...seller, validate(shipSchema), fulfillmentController.ship);
orderRoutes.post(
  '/:id/out-for-delivery',
  ...seller,
  validate(stepSchema),
  fulfillmentController.outForDelivery
);
orderRoutes.post('/:id/deliver', ...seller, validate(stepSchema), fulfillmentController.deliver);
orderRoutes.post(
  '/:id/cancel-package',
  ...seller,
  validate(cancelPackageSchema),
  fulfillmentController.cancelPackage
);
orderRoutes.post(
  '/:id/cancel',
  requireAuth,
  requireRole(ROLES.CUSTOMER),
  validate(cancelOrderSchema),
  fulfillmentController.cancelByCustomer
);

// The old "set any status" endpoint. It let any vendor on an order set the
// WHOLE order to anything — including Delivered → Pending, and Shipped with
// no tracking number — and one vendor's click moved every other vendor's
// items too. It is kept only so existing clients get a useful answer rather
// than a 404: it now goes through the same rules as the routes above.
orderRoutes.patch(
  '/:id/status',
  ...seller,
  validate(updateStatusSchema),
  orderController.updateStatus
);
