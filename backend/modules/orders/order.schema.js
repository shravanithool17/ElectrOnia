import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

export const createOrderSchema = {
  body: z.object({
    // Only ids and quantities are accepted. Any price the client sends is
    // ignored — see order.service.js.
    items: z
      .array(
        z.object({
          productId: objectId.optional(),
          _id: objectId.optional(),
          quantity: z.coerce.number().int().min(1, 'Quantity must be at least 1').max(20),
        })
          .refine((item) => item.productId || item._id, 'Each item needs a productId')
      )
      .min(1, 'Your cart is empty')
      .max(50, 'Too many items in one order'),

    shippingAddress: z.object({
      street: z.string().trim().min(3, 'Street is required').max(300),
      city: z.string().trim().min(2, 'City is required').max(120),
      zipCode: z.string().trim().min(4, 'Enter a valid postcode').max(12),
      phone: z.string().trim().min(6, 'Enter a valid phone number').max(20),
    }),

    paymentMethod: z.enum(['Card', 'UPI', 'COD']).optional(),
  }),
};

export const orderIdSchema = { params: z.object({ id: objectId }) };

export const updateStatusSchema = {
  params: orderIdSchema.params,
  // PendingPayment is set only by checkout and left only by the payment
  // provider. Nobody may move an order INTO it by hand.
  body: z.object({
    // Package steps the legacy endpoint can still express. PendingPayment,
    // Processing and PartiallyShipped are derived and never set by hand.
    status: z.enum(['Shipped', 'OutForDelivery', 'Delivered', 'Cancelled']),
  }),
};
