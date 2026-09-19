// modules/auth/auth.repo.js — the only file in this module that knows Mongoose.
import Customer from '../../model/user.model.js';
import Company from '../../model/company.model.js';

/**
 * The forgot-password writes are all conditional updates, so two requests
 * racing each other cannot both succeed:
 *
 *   startReset     — only if no code was issued within the cooldown, so a
 *                    burst of "send code" clicks sends one email, not ten
 *   claimAttempt   — spends one guess only while the code is live and has
 *                    guesses left; the guess is counted BEFORE it is checked
 *   completeReset  — only if the stored hash is still the one that matched,
 *                    so a code is spent exactly once
 */
function resetOps(Model) {
  return {
    startReset: (id, reset, cooldownCutoff) =>
      Model.updateOne(
        {
          _id: id,
          $or: [
            { passwordReset: { $exists: false } },
            { passwordReset: null },
            { 'passwordReset.requestedAt': { $lte: cooldownCutoff } },
          ],
        },
        { $set: { passwordReset: reset } }
      ),

    claimAttempt: (email, now, maxAttempts) =>
      Model.findOneAndUpdate(
        {
          email,
          'passwordReset.expiresAt': { $gt: now },
          'passwordReset.attempts': { $lt: maxAttempts },
        },
        { $inc: { 'passwordReset.attempts': 1 } },
        { new: true, projection: { name: 1, email: 1, passwordReset: 1 } }
      ),

    completeReset: (id, matchedHash, passwordHash, now) =>
      Model.updateOne(
        { _id: id, 'passwordReset.hash': matchedHash },
        { $set: { password: passwordHash, passwordChangedAt: now }, $unset: { passwordReset: 1 } }
      ),
  };
}

export const customerRepo = {
  findByEmail: (email) => Customer.findOne({ email }),
  findById: (id) => Customer.findById(id).select('-password'),
  create: (doc) => Customer.create(doc),
  ...resetOps(Customer),
};

export const vendorRepo = {
  findByEmail: (email) => Company.findOne({ email }),
  findById: (id) => Company.findById(id).select('-password'),
  create: (doc) => Company.create(doc),
  ...resetOps(Company),
};
