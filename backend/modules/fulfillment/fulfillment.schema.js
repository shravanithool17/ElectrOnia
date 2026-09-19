// modules/fulfillment/fulfillment.schema.js
import { z } from 'zod';
import mongoose from 'mongoose';

import { CARRIER_KEYS, TRACKING_NUMBER } from '../../lib/carriers.js';

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

const params = z.object({ id: objectId });

export const shipSchema = {
  params,
  body: z
    .object({
      carrier: z.enum(CARRIER_KEYS, { message: 'Choose a courier' }),
      carrierName: z.string().trim().min(2).max(60).optional(),
      trackingNumber: z
        .string()
        .trim()
        .regex(TRACKING_NUMBER, 'Tracking numbers are 6–40 letters, digits or dashes')
        .optional(),
      // https only — this link is shown to customers and opened in their
      // browser, so an http:// or javascript: value is refused outright.
      trackingUrl: z
        .string()
        .trim()
        .url('Enter a full link, starting with https://')
        .refine((value) => value.startsWith('https://'), 'The tracking link must start with https://')
        .optional(),
      fulfillmentId: objectId.optional(),
    })
    .superRefine((body, ctx) => {
      // A customer given "Shipped" with nothing to track is left refreshing a
      // page. Every courier issues a number; only self-delivery has none.
      if (body.carrier !== 'self' && !body.trackingNumber) {
        ctx.addIssue({
          path: ['trackingNumber'],
          code: z.ZodIssueCode.custom,
          message: 'Enter the tracking (AWB) number from the courier',
        });
      }
      if (body.carrier === 'other' && !body.carrierName) {
        ctx.addIssue({
          path: ['carrierName'],
          code: z.ZodIssueCode.custom,
          message: 'Name the courier',
        });
      }
    }),
};

export const stepSchema = {
  params,
  body: z.object({ fulfillmentId: objectId.optional() }).default({}),
};

export const cancelPackageSchema = {
  params,
  body: z.object({
    // Required: the customer is told why their package will not arrive.
    reason: z.string().trim().min(5, 'Tell the customer why (at least 5 characters)').max(300),
    fulfillmentId: objectId.optional(),
  }),
};

export const cancelOrderSchema = {
  params,
  body: z.object({ reason: z.string().trim().max(300).optional() }).default({}),
};
