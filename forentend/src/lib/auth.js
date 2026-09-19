// src/lib/auth.js — the one place that changes who the browser is signed in as.
//
// WHY THIS EXISTS
//
// The cart is owned by an identity: a signed-in user, or an anonymous guest
// cookie. CartContext fetches it once when the app mounts. Before this file,
// the token was written straight into localStorage by the login page, the
// signup page and the logout button — and nothing told the cart. So:
//
//   - add to cart as a guest, then SIGN UP: the drawer kept showing the guest
//     cart from memory, while checkout (which requires auth) read the new
//     account's empty cart and said "Your cart is empty"
//   - a token that expired, or died when JWT_SECRET changed, silently became a
//     guest on the cart and a 401 on checkout — two carts again
//
// Now every change of identity goes through setToken / clearToken, which fire
// one event. CartContext listens and re-reads the cart as whoever the browser
// now is. The `storage` event covers the same change made in another tab.

export const AUTH_EVENT = 'electronia:auth-changed';

const KEYS = { customer: 'token', vendor: 'vendorToken' };

function announce(detail) {
  try {
    window.dispatchEvent(new CustomEvent(AUTH_EVENT, { detail }));
  } catch {
    // Non-browser environment (tests, SSR) — nothing is listening anyway.
  }
}

export function getToken(role = 'customer') {
  try {
    return localStorage.getItem(KEYS[role] ?? KEYS.customer);
  } catch {
    return null;
  }
}

export function setToken(token, role = 'customer') {
  try {
    localStorage.setItem(KEYS[role] ?? KEYS.customer, token);
  } catch {
    // Storage blocked (private mode, quota). The session will not persist,
    // but the event still lets the current page react.
  }
  announce({ role, signedIn: true });
}

/**
 * Removes only the auth keys. The logout button used to call
 * localStorage.clear(), which also wiped the wishlist and any half-finished
 * signup — signing out should not delete what somebody saved.
 */
export function clearToken(role = 'customer', reason = 'signed-out') {
  try {
    localStorage.removeItem(KEYS[role] ?? KEYS.customer);
  } catch {
    /* see setToken */
  }
  announce({ role, signedIn: false, reason });
}

/** Subscribe to identity changes in this tab AND in other tabs. Returns an unsubscribe. */
export function onAuthChange(callback) {
  const onLocal = (event) => callback(event.detail ?? {});
  const onOtherTab = (event) => {
    if (event.key === null || Object.values(KEYS).includes(event.key)) {
      callback({ fromOtherTab: true, signedIn: Boolean(event.newValue) });
    }
  };

  window.addEventListener(AUTH_EVENT, onLocal);
  window.addEventListener('storage', onOtherTab);

  return () => {
    window.removeEventListener(AUTH_EVENT, onLocal);
    window.removeEventListener('storage', onOtherTab);
  };
}
