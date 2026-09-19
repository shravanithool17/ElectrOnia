// modules/addresses/address.service.js
import { NotFoundError, ValidationError } from '../../lib/errors.js';
import { addressRepo } from './address.repo.js';

const MAX_ADDRESSES = 10;

function toDto(address) {
  if (!address) return null;
  return {
    _id: address._id,
    label: address.label,
    fullName: address.fullName,
    phone: address.phone,
    line1: address.line1,
    line2: address.line2 ?? '',
    city: address.city,
    state: address.state,
    pincode: address.pincode,
    country: address.country ?? 'India',
    isDefault: Boolean(address.isDefault),
    // One preformatted line, so every screen renders the address identically.
    oneLine: [address.line1, address.line2, address.city, address.state, address.pincode]
      .filter(Boolean)
      .join(', '),
  };
}

export const addressService = {
  async list(userId) {
    const addresses = await addressRepo.listForUser(userId);
    return { items: addresses.map(toDto), total: addresses.length };
  },

  async create(userId, input) {
    const count = await addressRepo.count(userId);
    if (count >= MAX_ADDRESSES) {
      throw new ValidationError(`You can save up to ${MAX_ADDRESSES} addresses.`);
    }

    // The first address a user saves is their default whether they asked or not.
    const shouldBeDefault = input.isDefault || count === 0;
    if (shouldBeDefault) await addressRepo.clearDefaults(userId);

    const address = await addressRepo.create({
      ...input,
      userId,
      isDefault: shouldBeDefault,
    });

    return toDto(address.toObject());
  },

  async update(id, userId, updates) {
    if (updates.isDefault) await addressRepo.clearDefaults(userId, id);

    const address = await addressRepo.updateOwned(id, userId, updates);
    if (!address) throw new NotFoundError('Address not found');

    return toDto(address.toObject());
  },

  async setDefault(id, userId) {
    const exists = await addressRepo.findOwned(id, userId);
    if (!exists) throw new NotFoundError('Address not found');

    await addressRepo.clearDefaults(userId, id);
    const address = await addressRepo.updateOwned(id, userId, { isDefault: true });
    return toDto(address.toObject());
  },

  async remove(id, userId) {
    const address = await addressRepo.softDelete(id, userId);
    if (!address) throw new NotFoundError('Address not found');

    // Deleting the default promotes the next most recent, so the user is never
    // left without one.
    if (address.isDefault === false) {
      const remaining = await addressRepo.findDefault(userId);
      if (!remaining) {
        const next = await addressRepo.findAnyNewest(userId);
        if (next) await addressRepo.updateOwned(next._id, userId, { isDefault: true });
      }
    }
  },

  /** Used by checkout when no address was named. */
  async resolveForCheckout(userId, addressId = null) {
    const address = addressId
      ? await addressRepo.findOwned(addressId, userId)
      : (await addressRepo.findDefault(userId)) ?? (await addressRepo.findAnyNewest(userId));

    if (!address) {
      throw new ValidationError('Add a delivery address before checking out.');
    }
    return toDto(address.toObject ? address.toObject() : address);
  },
};
