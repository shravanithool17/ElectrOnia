// src/context/CartContext.jsx — the cart, owned by the server.
//
// WHAT CHANGED AND WHY
//
// This used to keep the cart in localStorage, including each item's price.
// Three problems with that:
//
//   1. The cart did not follow the customer. Add something on a phone, open a
//      laptop, empty cart.
//   2. Prices went stale. A product repriced or sold out after being added
//      showed its old price until checkout silently corrected it.
//   3. Totals were computed in the browser, so tax, shipping and discounts
//      were whatever the client said they were.
//
// Now `/api/v1/cart` is the source of truth. Every mutation returns the whole
// cart — lines, totals, and a `notices` array saying what the server changed
// and why ("this went up ₹2,000 since you added it", "only 2 left"). This
// component's job is to hold that response and re-fetch when it changes.
//
// A guest cart is owned by an httpOnly `cartToken` cookie the server issues,
// so it works before sign-in. `mergeGuestCart()` folds it into the user's own
// cart after login — call it from the login page once a token is stored.
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';

import { api } from '../lib/api';
import { onAuthChange } from '../lib/auth';

const CartContext = createContext(null);

/** The shape before the first response arrives, so consumers never see undefined. */
const EMPTY = {
  items: [],
  savedForLater: [],
  itemCount: 0,
  couponCode: null,
  notices: [],
  summary: {
    itemsSubtotal: { amount: 0, label: '₹0.00' },
    discountTotal: { amount: 0, label: '₹0.00' },
    taxTotal: { amount: 0, label: '₹0.00' },
    shippingTotal: { amount: 0, label: '₹0.00' },
    grandTotal: { amount: 0, label: '₹0.00' },
    freeShipping: false,
    amountToFreeShipping: { amount: 0, label: '₹0.00' },
    freeShippingThreshold: { amount: 0, label: '₹0.00' },
    appliedCoupon: null,
    couponError: null,
  },
};

export const CartProvider = ({ children }) => {
  const [cart, setCart] = useState(EMPTY);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [pending, setPending] = useState(0); // > 0 while a mutation is in flight
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [toast, setToast] = useState(null);

  const toastTimer = useRef(null);
  const noticesSeen = useRef('');

  // Every request that can write the cart takes a ticket; a response is only
  // applied if no newer request has been issued since. Without this, signing
  // in fires a refresh AND a merge, and if the refresh's response lands last
  // it overwrites the merged cart with the pre-merge one. The server's cart is
  // cumulative, so the newest response always contains everything older ones
  // did — discarding the stale ones loses nothing.
  const ticket = useRef(0);
  const take = () => (ticket.current += 1);
  const isLatest = (mine) => mine === ticket.current;

  const showToast = useCallback((message, tone = 'ok') => {
    setToast({ message, tone });
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  /**
   * Every cart endpoint returns the full cart, so one handler covers all of
   * them: run the request, store the response, surface the failure.
   */
  const run = useCallback(
    async (request, { successMessage } = {}) => {
      setPending((n) => n + 1);
      const mine = take();
      try {
        const next = await request();
        if (isLatest(mine)) {
          setCart(next);
          setStatus('ready');
          setError(null);
        }
        if (successMessage) showToast(successMessage);
        return next;
      } catch (err) {
        // A mutation failing does not invalidate the cart already on screen,
        // so the toast reports it and the state is left alone.
        showToast(err.message || 'Something went wrong', 'error');
        throw err;
      } finally {
        setPending((n) => Math.max(0, n - 1));
      }
    },
    [showToast]
  );

  const refresh = useCallback(async () => {
    const mine = take();
    try {
      const next = await api('/api/v1/cart', { auth: true });
      if (!isLatest(mine)) return;
      setCart(next);
      setStatus('ready');
      setError(null);
    } catch (err) {
      if (!isLatest(mine)) return;
      setStatus('error');
      setError(err.message || 'Could not load your cart');
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Re-read the cart whenever the browser's identity changes.
  //
  // This provider mounts once, above the router, so without this the cart it
  // holds belongs to whoever the browser was when the page first loaded. Sign
  // up after shopping as a guest and the drawer kept showing the guest cart
  // while checkout read the new account's (empty) one — the "products are in
  // the cart but it says the cart is empty" bug. Signing in, signing up,
  // signing out, a token found to be dead, and any of those in another tab
  // all come through here now.
  useEffect(
    () =>
      onAuthChange(() => {
        noticesSeen.current = '';
        refresh();
      }),
    [refresh]
  );

  // The server reports repricing and stock changes as notices. Show each one
  // once — re-showing on every response would be noise — and not at all while
  // the drawer is open, because it already lists them inline above the lines.
  // Toasting them there stacked a duplicate over the checkout button.
  useEffect(() => {
    if (!cart.notices?.length) return;

    const fingerprint = cart.notices.map((n) => `${n.code}:${n.productId ?? ''}`).join('|');
    if (fingerprint === noticesSeen.current) return;
    noticesSeen.current = fingerprint;

    if (isCartOpen) return;
    showToast(cart.notices[0].message, 'warn');
  }, [cart.notices, isCartOpen, showToast]);

  const addToCart = useCallback(
    (product, quantity = 1) =>
      run(
        () =>
          api('/api/v1/cart/items', {
            method: 'POST',
            auth: true,
            body: JSON.stringify({ productId: product._id, quantity }),
          }),
        { successMessage: `${product.title} added to your cart` }
      ),
    [run]
  );

  /** Absolute quantity. The server clamps to stock and to its per-line maximum. */
  const setQuantity = useCallback(
    (productId, quantity) =>
      run(() =>
        api(`/api/v1/cart/items/${productId}`, {
          method: 'PATCH',
          auth: true,
          body: JSON.stringify({ quantity }),
        })
      ),
    [run]
  );

  /**
   * Kept because the drawer's +/- buttons think in deltas. Dropping below one
   * removes the line rather than sending an invalid quantity.
   */
  const updateQuantity = useCallback(
    (productId, delta) => {
      const line = cart.items.find((item) => item.productId === productId);
      if (!line) return Promise.resolve(cart);

      const next = line.quantity + delta;
      if (next < 1) {
        return run(() => api(`/api/v1/cart/items/${productId}`, { method: 'DELETE', auth: true }));
      }
      return setQuantity(productId, next);
    },
    [cart, run, setQuantity]
  );

  const removeFromCart = useCallback(
    (productId) =>
      run(() => api(`/api/v1/cart/items/${productId}`, { method: 'DELETE', auth: true }), {
        successMessage: 'Removed from your cart',
      }),
    [run]
  );

  /** Moves a line between the cart and "saved for later", both ways. */
  const toggleSaveForLater = useCallback(
    (productId) =>
      run(() =>
        api(`/api/v1/cart/items/${productId}/save-for-later`, { method: 'POST', auth: true })
      ),
    [run]
  );

  const clearCart = useCallback(
    () => run(() => api('/api/v1/cart', { method: 'DELETE', auth: true })),
    [run]
  );

  const applyCoupon = useCallback(
    (code) =>
      run(
        () =>
          api('/api/v1/cart/coupon', {
            method: 'POST',
            auth: true,
            body: JSON.stringify({ code }),
          }),
        { successMessage: `Coupon ${code.toUpperCase()} applied` }
      ),
    [run]
  );

  const removeCoupon = useCallback(
    () => run(() => api('/api/v1/cart/coupon', { method: 'DELETE', auth: true })),
    [run]
  );

  /**
   * Call this immediately after a successful customer login. The guest token
   * is in an httpOnly cookie, so no argument is needed — the browser sends it
   * and the server reads it there.
   */
  const mergeGuestCart = useCallback(async () => {
    const mine = take();
    try {
      const next = await api('/api/v1/cart/merge', { method: 'POST', auth: true, body: '{}' });
      if (isLatest(mine)) {
        setCart(next);
        setStatus('ready');
      }
      return next;
    } catch {
      // A failed merge must never block signing in. The user's own cart is
      // still correct; only the pre-login additions would be missing, and a
      // refresh is the honest fallback.
      refresh();
      return null;
    }
  }, [refresh]);

  const value = {
    // state
    cart: cart.items, // the old name, so existing consumers keep working
    items: cart.items,
    savedForLater: cart.savedForLater,
    summary: cart.summary,
    notices: cart.notices,
    couponCode: cart.couponCode,
    cartCount: cart.itemCount,
    totalPrice: cart.summary.grandTotal.amount,
    status,
    error,
    busy: pending > 0,

    // actions
    addToCart,
    setQuantity,
    updateQuantity,
    removeFromCart,
    toggleSaveForLater,
    clearCart,
    applyCoupon,
    removeCoupon,
    mergeGuestCart,
    refresh,

    // ui
    isCartOpen,
    setIsCartOpen,
    toastMessage: toast?.message ?? null,
  };

  return (
    <CartContext.Provider value={value}>
      {children}
      {toast && <Toast tone={toast.tone} message={toast.message} shifted={isCartOpen} />}
    </CartContext.Provider>
  );
};

const TONES = {
  ok: 'bg-slate-900 text-white',
  warn: 'bg-signal-500 text-white',
  error: 'bg-red-600 text-white',
};

function Toast({ tone, message, shifted }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className={`fixed bottom-5 z-[60] max-w-sm px-4 py-3 rounded-md text-xs font-medium shadow-lg flex items-start gap-2.5 ${
        shifted ? 'right-5 sm:right-[27.5rem]' : 'right-5'
      } ${TONES[tone] ?? TONES.ok}`}
    >
      <span aria-hidden="true" className="mt-px shrink-0 font-bold">
        {tone === 'ok' ? '✓' : tone === 'warn' ? '!' : '×'}
      </span>
      <span>{message}</span>
    </div>
  );
}

export const useCart = () => {
  const context = useContext(CartContext);
  if (!context) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};
