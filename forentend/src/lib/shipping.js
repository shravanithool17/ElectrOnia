// src/lib/shipping.js — shipping vocabulary shared by the vendor and customer screens.
//
// The carrier keys must match backend/lib/carriers.js exactly; the API
// rejects anything else.

export const CARRIER_OPTIONS = [
  { value: 'delhivery', label: 'Delhivery' },
  { value: 'bluedart', label: 'Blue Dart' },
  { value: 'dtdc', label: 'DTDC' },
  { value: 'indiapost', label: 'India Post' },
  { value: 'ekart', label: 'Ekart' },
  { value: 'xpressbees', label: 'XpressBees' },
  { value: 'ecomexpress', label: 'Ecom Express' },
  { value: 'shadowfax', label: 'Shadowfax' },
  { value: 'shiprocket', label: 'Shiprocket' },
  { value: 'other', label: 'Other courier…' },
  { value: 'self', label: 'I will deliver it myself' },
];

/** The steps a package moves through, in order. Cancelled is off to the side. */
export const PACKAGE_STEPS = [
  { status: 'Pending', label: 'Packed', dateKey: null },
  { status: 'Shipped', label: 'Shipped', dateKey: 'shippedAt' },
  { status: 'OutForDelivery', label: 'Out for delivery', dateKey: 'outForDeliveryAt' },
  { status: 'Delivered', label: 'Delivered', dateKey: 'deliveredAt' },
];

export const STEP_INDEX = Object.fromEntries(PACKAGE_STEPS.map((step, index) => [step.status, index]));

export const PACKAGE_TONE = {
  Pending: 'amber',
  Shipped: 'blue',
  OutForDelivery: 'blue',
  Delivered: 'green',
  Cancelled: 'red',
};

export const ORDER_TONE = {
  PendingPayment: 'amber',
  Pending: 'amber',
  Processing: 'blue',
  PartiallyShipped: 'blue',
  Shipped: 'blue',
  Delivered: 'green',
  Cancelled: 'red',
};

export const ORDER_LABEL = {
  PendingPayment: 'Awaiting payment',
  PartiallyShipped: 'Partly shipped',
};

export function shortDate(value) {
  if (!value) return null;
  return new Date(value).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
}
