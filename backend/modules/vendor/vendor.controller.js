import { asyncHandler } from '../../lib/asyncHandler.js';
import { vendorService } from './vendor.service.js';

export const vendorController = {
  dashboard: asyncHandler(async (req, res) => {
    res.json(await vendorService.dashboard(req.user.id));
  }),
};
