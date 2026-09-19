import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { productController } from './product.controller.js';
import {
  listProductsSchema,
  productIdSchema,
  createProductSchema,
  updateProductSchema,
} from './product.schema.js';

export const productRoutes = Router();

productRoutes.get('/', validate(listProductsSchema), productController.list);

// Static paths are declared before '/:id' so they are not parsed as ids.
productRoutes.get('/facets', validate(listProductsSchema), productController.facets);
productRoutes.get('/mine', requireAuth, requireRole(ROLES.VENDOR), productController.mine);

productRoutes.get('/:id', validate(productIdSchema), productController.getOne);
productRoutes.get('/:id/related', validate(productIdSchema), productController.related);

productRoutes.post(
  '/',
  requireAuth,
  requireRole(ROLES.VENDOR),
  validate(createProductSchema),
  productController.create
);

productRoutes.patch(
  '/:id',
  requireAuth,
  requireRole(ROLES.VENDOR),
  validate(updateProductSchema),
  productController.update
);

productRoutes.delete(
  '/:id',
  requireAuth,
  requireRole(ROLES.VENDOR),
  validate(productIdSchema),
  productController.remove
);
