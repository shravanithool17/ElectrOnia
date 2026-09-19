import { z } from 'zod';

const email = z.string().trim().toLowerCase().email('Enter a valid email address');
const password = z.string().min(8, 'Password must be at least 8 characters').max(200);
const phone = z.string().trim().min(6, 'Enter a valid phone number').max(20);
const name = z.string().trim().min(2, 'Name is too short').max(120);
const address = z.string().trim().min(5, 'Address is too short').max(500);

export const sendOtpSchema = { body: z.object({ email }) };

export const verifyOtpSchema = {
  body: z.object({
    email,
    otp: z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits'),
  }),
};

export const customerRegisterSchema = {
  body: z.object({ name, email, password, address, phone }),
};

export const vendorRegisterSchema = {
  body: z.object({
    name,
    email,
    password,
    address,
    phone,
    domain: z.string().trim().min(2, 'Tell us your business domain').max(120),
  }),
};

export const loginSchema = {
  body: z.object({ email, password: z.string().min(1, 'Password is required') }),
};

const accountRole = z.enum(['customer', 'vendor']).default('customer');
const code = z.string().trim().regex(/^\d{6}$/, 'The code is 6 digits');

export const forgotPasswordSchema = {
  body: z.object({ email, role: accountRole }),
};

export const resetPasswordSchema = {
  body: z.object({ email, role: accountRole, code, password }),
};
