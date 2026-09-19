import { Router } from 'express';
import { validate } from '../../middleware/validate.js';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { addressController } from './address.controller.js';
import {
  createAddressSchema,
  updateAddressSchema,
  addressIdSchema,
} from './address.schema.js';

export const addressRoutes = Router();

// An address book belongs to one customer; the id always comes from the token.
addressRoutes.use(requireAuth, requireRole(ROLES.CUSTOMER));

addressRoutes.get('/', addressController.list);
addressRoutes.post('/', validate(createAddressSchema), addressController.create);
addressRoutes.patch('/:id', validate(updateAddressSchema), addressController.update);
addressRoutes.post('/:id/default', validate(addressIdSchema), addressController.setDefault);
addressRoutes.delete('/:id', validate(addressIdSchema), addressController.remove);
