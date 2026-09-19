// lib/carriers.js — courier partners a vendor can ship with.
//
// WHY THERE ARE NO DEEP TRACKING LINKS HERE
//
// Each courier has a URL that opens a specific shipment, and each has changed
// that URL format at some point. A hard-coded pattern that has gone stale
// sends a customer to a 404 or somebody else's page, which is worse than no
// link. These patterns could not be verified from the environment this was
// written in, so they are not guessed at.
//
// Instead: the carrier's own site is linked (the customer pastes the number,
// which the orders page lets them copy in one tap), and the VENDOR may paste
// the exact tracking link their courier gave them. When they do, that link
// wins. If you confirm a carrier's current deep-link format, add it as
// `trackingUrl: (awb) => ...` and it will be used automatically.

export const CARRIERS = {
  delhivery: { name: 'Delhivery', site: 'https://www.delhivery.com' },
  bluedart: { name: 'Blue Dart', site: 'https://www.bluedart.com' },
  dtdc: { name: 'DTDC', site: 'https://www.dtdc.in' },
  indiapost: { name: 'India Post', site: 'https://www.indiapost.gov.in' },
  ekart: { name: 'Ekart', site: 'https://ekartlogistics.com' },
  xpressbees: { name: 'XpressBees', site: 'https://www.xpressbees.com' },
  ecomexpress: { name: 'Ecom Express', site: 'https://www.ecomexpress.in' },
  shadowfax: { name: 'Shadowfax', site: 'https://www.shadowfax.in' },
  shiprocket: { name: 'Shiprocket', site: 'https://www.shiprocket.in' },
  // Hand delivery, a local courier, anything not listed. Requires a name.
  other: { name: 'Other', site: null },
  // The vendor delivers it themselves. No tracking number is required.
  self: { name: 'Delivered by seller', site: null },
};

export const CARRIER_KEYS = Object.keys(CARRIERS);

/**
 * Tracking numbers across Indian couriers are alphanumeric, typically 8–20
 * characters. The range is deliberately a little wider than that: rejecting a
 * real number blocks a vendor from shipping, which costs more than accepting
 * an odd-looking one.
 */
export const TRACKING_NUMBER = /^[A-Za-z0-9-]{6,40}$/;

/**
 * Resolves where "Track package" should go.
 *
 * @param {{carrier: string, trackingNumber?: string, trackingUrl?: string|null}} shipment
 * @returns {{url: string|null, kind: 'exact'|'carrier-site'|null}}
 */
export function trackingLinkFor({ carrier, trackingNumber, trackingUrl }) {
  // The vendor's link is the one their courier gave them, so it is the most
  // likely to be correct.
  if (trackingUrl) return { url: trackingUrl, kind: 'exact' };

  const known = CARRIERS[carrier];
  if (known?.trackingUrl && trackingNumber) {
    return { url: known.trackingUrl(encodeURIComponent(trackingNumber)), kind: 'exact' };
  }
  if (known?.site) return { url: known.site, kind: 'carrier-site' };
  return { url: null, kind: null };
}

/** Display name: the listed name, or what the vendor typed for "Other". */
export function carrierDisplayName(carrier, carrierName) {
  if (carrier === 'other') return carrierName || 'Courier';
  return CARRIERS[carrier]?.name ?? carrierName ?? 'Courier';
}
