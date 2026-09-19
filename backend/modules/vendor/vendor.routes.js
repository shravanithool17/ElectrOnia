import { Router } from 'express';
import { requireAuth, requireRole, ROLES } from '../../middleware/auth.js';
import { vendorController } from './vendor.controller.js';

export const vendorRoutes = Router();

// Every route here is vendor-scoped: the id comes from the verified token, so
// there is no way to ask for another vendor's figures.
vendorRoutes.use(requireAuth, requireRole(ROLES.VENDOR));

vendorRoutes.get('/dashboard', vendorController.dashboard);
