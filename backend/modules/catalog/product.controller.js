import { asyncHandler } from '../../lib/asyncHandler.js';
import { productService } from './product.service.js';

export const productController = {
  list: asyncHandler(async (req, res) => {
    res.json(await productService.list(req.query));
  }),

  facets: asyncHandler(async (req, res) => {
    res.json(await productService.facets(req.query));
  }),

  related: asyncHandler(async (req, res) => {
    res.json(await productService.getRelated(req.params.id));
  }),

  mine: asyncHandler(async (req, res) => {
    res.json(await productService.listForVendor(req.user.id));
  }),

  getOne: asyncHandler(async (req, res) => {
    res.json(await productService.getById(req.params.id));
  }),

  create: asyncHandler(async (req, res) => {
    const product = await productService.create(req.user.id, req.body);
    res.status(201).json({ message: 'Product created', product });
  }),

  update: asyncHandler(async (req, res) => {
    const product = await productService.update(req.params.id, req.user.id, req.body);
    res.json({ message: 'Product updated', product });
  }),

  remove: asyncHandler(async (req, res) => {
    await productService.remove(req.params.id, req.user.id);
    res.json({ message: 'Product deleted' });
  }),
};
