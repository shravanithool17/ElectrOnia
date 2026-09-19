// src/lib/images.js — resolving product image URLs.
//
// The seed catalogue stores image paths RELATIVE to the API origin
// (`/media/products/laptop/graphite/front.svg`) rather than absolute URLs,
// because the same database is served from localhost in development and from
// a deployed host in production, and baking an origin into the data means
// reseeding to move environments.
//
// A vendor who uploads their own photography will have absolute URLs on some
// products, so this handles both: anything starting with a scheme, a protocol-
// relative `//`, or `data:` is passed through untouched.
import { API_BASE } from './api';

/** Local SVG data URI — no network, so it renders even if the API is down. */
export const IMAGE_PLACEHOLDER =
  'data:image/svg+xml;utf8,' +
  encodeURIComponent(
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1000 750" width="1000" height="750">
      <rect width="1000" height="750" fill="#F1F3F5"/>
      <rect x="330" y="255" width="340" height="240" rx="18" fill="none" stroke="#B3B9C2" stroke-width="10"/>
      <circle cx="424" cy="331" r="30" fill="#B3B9C2"/>
      <path d="M356 470 L470 356 L560 446 L616 402 L644 470 Z" fill="#B3B9C2"/>
    </svg>`
  );

/**
 * @param {string|undefined|null} path An absolute URL, or a path relative to the API origin.
 * @returns {string} A URL an <img src> can use. Falls back to the placeholder.
 */
export function imageUrl(path) {
  if (!path || typeof path !== 'string') return IMAGE_PLACEHOLDER;

  const trimmed = path.trim();
  if (!trimmed) return IMAGE_PLACEHOLDER;

  // Already absolute, protocol-relative, or inline.
  if (/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(trimmed)) return trimmed;

  const url = `${API_BASE}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;

  // Generated product art is drawn on its own light backdrop. The storefront
  // is a dark blueprint sheet, so ask for the device alone on a transparent
  // ground instead of a pale rectangle in every card.
  return isGeneratedArt(trimmed) ? withQuery(url, 'style=cutout') : url;
}

const isGeneratedArt = (path) => /^\/?media\/products\//.test(path) && !path.includes('?');
const withQuery = (url, q) => `${url}${url.includes('?') ? '&' : '?'}${q}`;

/**
 * Generated art for a bare shape and colourway, on a transparent ground —
 * for decorative use (the homepage hero and category shelf).
 */
export function shapeImage(shape, colorway = 'silver', view = 'front') {
  return `${API_BASE}/media/products/${shape}/${colorway}/${view}.svg?style=cutout`;
}

/**
 * Every image on a product, resolved, with the placeholder as a last resort so
 * a gallery is never empty.
 *
 * @param {{images?: string[], image?: string}} product
 * @returns {string[]}
 */
export function productImages(product) {
  const raw = Array.isArray(product?.images) && product.images.length
    ? product.images
    : [product?.image].filter(Boolean);

  const resolved = raw.map(imageUrl).filter(Boolean);
  return resolved.length ? resolved : [IMAGE_PLACEHOLDER];
}

/** The card / thumbnail image for a product. */
export function primaryImage(product) {
  return productImages(product)[0];
}
