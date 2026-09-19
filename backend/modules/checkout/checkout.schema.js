import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

export const quoteSchema = {
  body: z.object({
    addressId: objectId.nullable().optional(),
  }),
};

export const placeOrderSchema = {
  body: z.object({
    addressId: objectId.nullable().optional(),
    paymentMethod: z.enum(['Card', 'UPI', 'COD', 'Razorpay']).optional(),
  }),
};
