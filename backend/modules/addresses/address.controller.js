import { asyncHandler } from '../../lib/asyncHandler.js';
import { addressService } from './address.service.js';

export const addressController = {
  list: asyncHandler(async (req, res) => {
    res.json(await addressService.list(req.user.id));
  }),

  create: asyncHandler(async (req, res) => {
    const address = await addressService.create(req.user.id, req.body);
    res.status(201).json({ message: 'Address saved', address });
  }),

  update: asyncHandler(async (req, res) => {
    const address = await addressService.update(req.params.id, req.user.id, req.body);
    res.json({ message: 'Address updated', address });
  }),

  setDefault: asyncHandler(async (req, res) => {
    const address = await addressService.setDefault(req.params.id, req.user.id);
    res.json({ message: 'Default address updated', address });
  }),

  remove: asyncHandler(async (req, res) => {
    await addressService.remove(req.params.id, req.user.id);
    res.json({ message: 'Address removed' });
  }),
};
