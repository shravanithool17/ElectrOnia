import Order, { ABANDONED_ORDER, VENDOR_VISIBLE_ORDER } from '../../model/order.model.js';

export const orderRepo = {
  create: (doc) => Order.create(doc),

  // Abandoned payment attempts are hidden. An order still awaiting payment is
  // shown, as "Awaiting payment", because the customer is in the middle of it.
  findForCustomer: (customerId) =>
    Order.find({ customerId, $nor: [ABANDONED_ORDER] }).sort({ createdAt: -1 }).lean(),

  // Only orders that are paid or cash on delivery — see VENDOR_VISIBLE_ORDER.
  findForVendor: (vendorId) =>
    Order.find({ vendorIds: vendorId, ...VENDOR_VISIBLE_ORDER }).sort({ createdAt: -1 }).lean(),

  /**
   * `filter` carries the authorisation: a vendor's filter includes
   * `vendorIds: <their id>`, so an order they have no line in does not match.
   */
  updateStatus: (filter, status, byRole) =>
    Order.findOneAndUpdate(
      filter,
      { status, $push: { statusHistory: { status, at: new Date(), byRole } } },
      { new: true }
    ),
};
