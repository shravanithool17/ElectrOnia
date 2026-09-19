import { z } from 'zod';
import mongoose from 'mongoose';

export const CATEGORIES = ['Laptops', 'Smartphones', 'Audio', 'Wearables', 'Gaming', 'Accessories'];

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

// Money arrives from clients as integer paise — see docs/adr/0003.
const paise = z
  .coerce.number()
  .int('Amounts must be whole paise, not rupees with decimals')
  .min(0, 'Amount cannot be negative')
  .max(100_000_000_00, 'That amount is implausible');

export const listProductsSchema = {
  query: z.object({
    search: z.string().trim().max(120).optional(),
    category: z.enum([...CATEGORIES, 'All']).optional(),
    brand: z.string().trim().max(80).optional(),
    minPrice: z.coerce.number().int().min(0).optional(),
    maxPrice: z.coerce.number().int().min(0).optional(),
    sort: z.enum(['price_asc', 'price_desc', 'rating', 'newest']).optional(),
    featured: z.enum(['true', 'false']).optional(),
    page: z.coerce.number().int().min(1).optional(),
    limit: z.coerce.number().int().min(1).max(60).optional(),
  }),
};

export const productIdSchema = { params: z.object({ id: objectId }) };

export const createProductSchema = {
  body: z.object({
    title: z.string().trim().min(3, 'Title is too short').max(200),
    description: z.string().trim().min(10, 'Describe the product in a little more detail').max(5000),
    price: paise,
    originalPrice: paise.optional(),
    category: z.enum(CATEGORIES),
    brand: z.string().trim().min(1, 'Brand is required').max(80),
    stock: z.coerce.number().int().min(0).max(1_000_000).optional(),
    images: z.array(z.string().url('Each image must be a URL')).max(10).optional(),
    specifications: z.record(z.string(), z.string()).optional(),
    featured: z.coerce.boolean().optional(),
  }),
};

export const updateProductSchema = {
  params: productIdSchema.params,
  // .partial() then a non-empty check, so PATCH with an empty body is a 422
  // rather than a silent no-op.
  body: createProductSchema.body.partial().refine(
    (value) => Object.keys(value).length > 0,
    'Provide at least one field to update'
  ),
};
