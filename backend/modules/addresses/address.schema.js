import { z } from 'zod';
import mongoose from 'mongoose';

const objectId = z
  .string()
  .refine((value) => mongoose.Types.ObjectId.isValid(value), 'Not a valid id');

const base = {
  label: z.string().trim().max(40).optional(),
  fullName: z.string().trim().min(2, 'Name is too short').max(120),
  phone: z
    .string()
    .trim()
    .regex(/^[0-9+\-\s()]{6,20}$/, 'Enter a valid phone number'),
  line1: z.string().trim().min(3, 'Address line 1 is required').max(300),
  line2: z.string().trim().max(300).optional(),
  city: z.string().trim().min(2, 'City is required').max(120),
  state: z.string().trim().min(2, 'State is required').max(120),
  // Indian PIN codes are 6 digits and never start with 0.
  pincode: z.string().trim().regex(/^[1-9][0-9]{5}$/, 'Enter a valid 6-digit PIN code'),
  country: z.string().trim().max(60).optional(),
  isDefault: z.coerce.boolean().optional(),
};

export const createAddressSchema = { body: z.object(base) };

export const addressIdSchema = { params: z.object({ id: objectId }) };

export const updateAddressSchema = {
  params: addressIdSchema.params,
  body: z
    .object(base)
    .partial()
    .refine((value) => Object.keys(value).length > 0, 'Provide at least one field to update'),
};
