import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

export const addItemSchema = {
  body: z.object({
    productId: objectId,
    quantity: z.coerce.number().int().min(1).max(20).default(1),
  }),
};

export const itemParamSchema = { params: z.object({ productId: objectId }) };

export const updateItemSchema = {
  params: itemParamSchema.params,
  body: z.object({ quantity: z.coerce.number().int().min(1).max(20) }),
};

export const mergeSchema = {
  // Optional: the normal path reads the guest token from the httpOnly cookie,
  // which a browser script cannot reach. The body form is for tests.
  body: z.object({ guestToken: z.string().trim().min(10).max(128).optional() }),
};

export const couponSchema = {
  body: z.object({
    code: z.string().trim().toUpperCase().min(3).max(32),
  }),
};
