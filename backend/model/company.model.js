import mongoose from 'mongoose';
import { passwordResetSchema } from './user.model.js';

const companySchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    domain: { type: String, required: true, trim: true },
    passwordReset: { type: passwordResetSchema, default: undefined, select: false },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Company', companySchema);
