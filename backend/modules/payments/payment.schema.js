import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

export const createIntentSchema = {
  body: z.object({ orderId: objectId }),
};

export const confirmSchema = {
  body: z.object({
    // Razorpay's own id formats. Pinning the prefix means a malformed value is
    // rejected at the edge instead of becoming a failed provider lookup.
    razorpay_order_id: z.string().trim().regex(/^order_[A-Za-z0-9]+$/, 'Not a Razorpay order id'),
    razorpay_payment_id: z.string().trim().regex(/^pay_[A-Za-z0-9]+$/, 'Not a Razorpay payment id'),
    razorpay_signature: z.string().trim().regex(/^[a-f0-9]{64}$/, 'Not a valid signature'),
  }),
};
