import mongoose from 'mongoose';

// Forgot-password state. Only a bcrypt hash of the emailed code is kept, never
// the code. `select: false` keeps it out of every ordinary read; the reset
// service asks for it explicitly.
export const passwordResetSchema = new mongoose.Schema(
  {
    hash: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    attempts: { type: Number, default: 0 },
    requestedAt: { type: Date, required: true },
  },
  { _id: false }
);

// NOTE: the model name is 'Cutomers' (sic), so the collection is `cutomers`.
// Renaming it would orphan existing documents, so it is left alone until there
// is a migration. Do not copy this typo into new models.
const customerSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true },
    address: { type: String, required: true, trim: true },
    phone: { type: String, required: true, trim: true },
    passwordReset: { type: passwordResetSchema, default: undefined, select: false },
    passwordChangedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export default mongoose.model('Cutomers', customerSchema);
