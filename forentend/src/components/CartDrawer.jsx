// src/components/CartDrawer.jsx — the cart panel.
//
// Everything shown here comes from the server's cart response: line totals,
// the discount, GST, shipping, and the `notices` list. Nothing is recomputed
// in the browser, so the number in this drawer is the number checkout charges.
//
// Three things the old drawer could not do, because a localStorage array had
// nowhere to put them:
//   - notices ("this went up since you added it", "only 2 left")
//   - save for later, which moves a line out of the total without losing it
//   - the coupon field, validated by the server against this exact cart
import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { useCart } from '../context/CartContext';
import { primaryImage } from '../lib/images';
import { Button, Spinner } from './ui';

const NOTICE_TONE = {
  PRICE_INCREASED: 'text-signal-700 bg-signal-50 border-signal-200',
  PRICE_DECREASED: 'text-emerald-700 bg-emerald-50 border-emerald-200',
  QUANTITY_REDUCED: 'text-signal-700 bg-signal-50 border-signal-200',
  OUT_OF_STOCK: 'text-red-700 bg-red-50 border-red-200',
  PRODUCT_UNAVAILABLE: 'text-red-700 bg-red-50 border-red-200',
  COUPON_INVALID: 'text-red-700 bg-red-50 border-red-200',
};

const CartDrawer = () => {
  const {
    items,
    savedForLater,
    summary,
    notices,
    couponCode,
    cartCount,
    status,
    error,
    busy,
    isCartOpen,
    setIsCartOpen,
    removeFromCart,
    updateQuantity,
    toggleSaveForLater,
    applyCoupon,
    removeCoupon,
    refresh,
  } = useCart();

  const navigate = useNavigate();
  const panelRef = useRef(null);
  const [couponDraft, setCouponDraft] = useState('');

  // Escape closes, and the panel takes focus so a keyboard user is not left
  // tabbing through the page behind it.
  useEffect(() => {
    if (!isCartOpen) return undefined;

    const onKeyDown = (event) => {
      if (event.key === 'Escape') setIsCartOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);
    panelRef.current?.focus();

    const { overflow } = document.body.style;
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.body.style.overflow = overflow;
    };
  }, [isCartOpen, setIsCartOpen]);

  if (!isCartOpen) return null;

  const unavailableLines = items.filter((line) => line.unavailable);
  const blocked = unavailableLines.length > 0;

  // One click instead of hunting for each dead line. These are usually left
  // behind when a product was delisted — or, before the seed was fixed, when
  // the catalogue was reseeded and every product got a new id.
  const removeUnavailable = async () => {
    for (const line of unavailableLines) {
      try {
        await removeFromCart(line.productId);
      } catch {
        // The context already surfaced it; carry on with the rest.
      }
    }
  };

  const handleCheckout = () => {
    setIsCartOpen(false);
    navigate('/checkout');
  };

  const handleCoupon = async (event) => {
    event.preventDefault();
    const code = couponDraft.trim();
    if (!code) return;
    try {
      await applyCoupon(code);
      setCouponDraft('');
    } catch {
      // The context already surfaced the reason; keep the code for editing.
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" role="dialog" aria-modal="true" aria-label="Shopping cart">
      <div
        className="absolute inset-0 bg-slate-900/25 backdrop-blur-sm"
        onClick={() => setIsCartOpen(false)}
        aria-hidden="true"
      />

      <div className="fixed inset-y-0 right-0 max-w-full flex sm:pl-10">
        <div
          ref={panelRef}
          tabIndex={-1}
          className="w-screen max-w-md bg-white text-slate-800 shadow-xl flex flex-col border-l border-slate-200 outline-none"
        >
          {/* ------------------------------------------------------- header */}
          <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display text-base font-semibold text-slate-900">Your cart</h2>
              <span className="label-mono text-slate-400">
                {cartCount} {cartCount === 1 ? 'item' : 'items'}
              </span>
              {busy && <Spinner className="w-3.5 h-3.5 text-slate-400" />}
            </div>
            <button
              onClick={() => setIsCartOpen(false)}
              aria-label="Close cart"
              className="w-8 h-8 grid place-items-center rounded text-slate-400 hover:text-slate-900 hover:bg-slate-100"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* --------------------------------------------------------- body */}
          <div className="flex-1 overflow-y-auto">
            {status === 'loading' && (
              <div className="p-5 flex flex-col gap-3">
                {[0, 1, 2].map((i) => (
                  <div key={i} className="h-20 bg-slate-100 rounded animate-pulse" />
                ))}
              </div>
            )}

            {status === 'error' && (
              <div className="p-8 text-center flex flex-col items-center gap-3">
                <p className="text-sm text-slate-600">{error}</p>
                <Button variant="secondary" onClick={refresh}>
                  Try again
                </Button>
              </div>
            )}

            {status === 'ready' && (
              <>
                {/* The server says what it changed and why. */}
                {notices?.length > 0 && (
                  <ul className="p-4 pb-0 flex flex-col gap-2">
                    {notices.map((notice, index) => (
                      <li
                        key={`${notice.code}-${notice.productId ?? index}`}
                        className={`text-[11px] leading-relaxed px-3 py-2 rounded border ${NOTICE_TONE[notice.code] ?? 'text-slate-600 bg-slate-50 border-slate-200'}`}
                      >
                        {notice.message}
                      </li>
                    ))}
                  </ul>
                )}

                {items.length === 0 ? (
                  <div className="px-8 py-16 text-center flex flex-col items-center gap-3">
                    <span className="text-3xl" aria-hidden="true">🛒</span>
                    <p className="text-sm font-medium text-slate-900">Your cart is empty</p>
                    <p className="text-xs text-slate-500 max-w-xs">
                      Anything you add stays here — on this device and the next one you sign in from.
                    </p>
                    <Button className="mt-1" onClick={() => { setIsCartOpen(false); navigate('/products'); }}>
                      Browse products
                    </Button>
                  </div>
                ) : (
                  <ul className="p-4 flex flex-col gap-3">
                    {items.map((line) => (
                      <CartLine
                        key={line.productId}
                        line={line}
                        onRemove={() => removeFromCart(line.productId)}
                        onStep={(delta) => updateQuantity(line.productId, delta)}
                        onSave={() => toggleSaveForLater(line.productId)}
                        busy={busy}
                      />
                    ))}
                  </ul>
                )}

                {savedForLater?.length > 0 && (
                  <div className="px-4 pb-4">
                    <p className="label-mono text-slate-400 mb-2">
                      Saved for later · {savedForLater.length}
                    </p>
                    <ul className="flex flex-col gap-2">
                      {savedForLater.map((line) => (
                        <li
                          key={line.productId}
                          className="flex items-center gap-3 border border-dashed border-slate-200 rounded p-2.5"
                        >
                          <img
                            src={primaryImage({ images: [line.image] })}
                            alt=""
                            className="w-10 h-10 object-contain bg-slate-50 rounded shrink-0"
                          />
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-medium text-slate-900 truncate">{line.title}</p>
                            <p className="label-mono text-slate-400">{line.unitPriceLabel}</p>
                          </div>
                          <button
                            onClick={() => toggleSaveForLater(line.productId)}
                            disabled={busy}
                            className="text-[11px] font-semibold text-blue-600 hover:underline shrink-0 disabled:opacity-40"
                          >
                            Move to cart
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </>
            )}
          </div>

          {/* ------------------------------------------------------- footer */}
          {status === 'ready' && items.length > 0 && (
            <div className="border-t border-slate-200 p-5 flex flex-col gap-4 shrink-0">
              {/* Free-shipping progress: a number the server computed, not a guess. */}
              {!summary.freeShipping && summary.amountToFreeShipping.amount > 0 && (
                <div className="flex flex-col gap-1.5">
                  <p className="text-[11px] text-slate-600">
                    <span className="font-semibold text-slate-900">
                      {summary.amountToFreeShipping.label}
                    </span>{' '}
                    away from free shipping
                  </p>
                  <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-blue-600 transition-[width] duration-300"
                      style={{
                        width: `${Math.min(
                          100,
                          (summary.itemsSubtotal.amount / Math.max(1, summary.freeShippingThreshold.amount)) * 100
                        )}%`,
                      }}
                    />
                  </div>
                </div>
              )}

              {/* ------------------------------------------------- coupon */}
              {summary.appliedCoupon || couponCode ? (
                <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-emerald-800 font-mono">
                      {summary.appliedCoupon ?? couponCode}
                    </p>
                    <p className="text-[11px] text-emerald-700">
                      {summary.discountTotal.amount > 0
                        ? `${summary.discountTotal.label} off`
                        : 'Not applied to this cart'}
                    </p>
                  </div>
                  <button
                    onClick={removeCoupon}
                    disabled={busy}
                    className="text-[11px] font-semibold text-emerald-800 hover:underline shrink-0 disabled:opacity-40"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <form onSubmit={handleCoupon} className="flex gap-2">
                  <input
                    value={couponDraft}
                    onChange={(event) => setCouponDraft(event.target.value.toUpperCase())}
                    placeholder="Coupon code"
                    aria-label="Coupon code"
                    className="flex-1 min-w-0 border border-slate-200 rounded px-3 py-2 text-xs font-mono uppercase placeholder:font-sans placeholder:normal-case focus:outline-none focus:border-slate-900"
                  />
                  <Button type="submit" variant="secondary" disabled={busy || !couponDraft.trim()}>
                    Apply
                  </Button>
                </form>
              )}

              {/* ------------------------------------------------ totals */}
              <dl className="flex flex-col gap-1.5 text-xs">
                <Row label="Subtotal" value={summary.itemsSubtotal.label} />
                {summary.discountTotal.amount > 0 && (
                  <Row label="Discount" value={`− ${summary.discountTotal.label}`} tone="text-emerald-700" />
                )}
                <Row label="GST" value={summary.taxTotal.label} />
                <Row
                  label="Shipping"
                  value={summary.freeShipping ? 'Free' : summary.shippingTotal.label}
                  tone={summary.freeShipping ? 'text-emerald-700' : undefined}
                />
                <div className="flex items-baseline justify-between pt-2 mt-1 border-t border-slate-200">
                  <dt className="text-sm font-semibold text-slate-900">Total</dt>
                  <dd className="font-mono text-base font-semibold text-slate-900 tabular-nums">
                    {summary.grandTotal.label}
                  </dd>
                </div>
              </dl>

              {blocked ? (
                <Button className="w-full" variant="secondary" onClick={removeUnavailable} disabled={busy}>
                  Remove {unavailableLines.length} unavailable {unavailableLines.length === 1 ? 'item' : 'items'}
                </Button>
              ) : (
                <Button className="w-full" onClick={handleCheckout} disabled={busy}>
                  Checkout
                </Button>
              )}
              <p className="text-[11px] text-slate-400 text-center">
                Inclusive of GST. Final total is confirmed at checkout.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

function Row({ label, value, tone }) {
  return (
    <div className="flex items-baseline justify-between">
      <dt className="text-slate-500">{label}</dt>
      <dd className={`font-mono tabular-nums ${tone ?? 'text-slate-900'}`}>{value}</dd>
    </div>
  );
}

function CartLine({ line, onRemove, onStep, onSave, busy }) {
  return (
    <li
      className={`flex gap-3 border rounded p-3 items-start ${
        line.unavailable ? 'border-red-200 bg-red-50/40' : 'border-slate-200 bg-white'
      }`}
    >
      <img
        src={primaryImage({ images: [line.image] })}
        alt={line.title}
        className="w-14 h-14 object-contain bg-slate-50 rounded border border-slate-100 shrink-0"
      />

      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-xs font-semibold text-slate-900 truncate">{line.title}</p>
            <p className="label-mono text-slate-400">{line.brand}</p>
          </div>
          <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
            {line.lineTotalLabel}
          </p>
        </div>

        {line.priceChanged && (
          <p className="text-[11px] text-signal-700">
            Now {line.unitPriceLabel} — repriced since you added it
          </p>
        )}
        {line.unavailable && (
          <p className="text-[11px] text-red-700 font-medium">
            Out of stock — remove it to check out
          </p>
        )}

        <div className="flex items-center gap-3 mt-0.5">
          <div className="flex items-center border border-slate-200 rounded overflow-hidden text-xs">
            <button
              onClick={() => onStep(-1)}
              disabled={busy}
              aria-label="Decrease quantity"
              className="w-6 h-6 grid place-items-center hover:bg-slate-100 disabled:opacity-40"
            >
              −
            </button>
            <span className="w-8 text-center font-mono tabular-nums">{line.quantity}</span>
            <button
              onClick={() => onStep(1)}
              disabled={busy || line.unavailable}
              aria-label="Increase quantity"
              className="w-6 h-6 grid place-items-center hover:bg-slate-100 disabled:opacity-40"
            >
              +
            </button>
          </div>

          <button
            onClick={onSave}
            disabled={busy}
            className="text-[11px] text-slate-500 hover:text-slate-900 disabled:opacity-40"
          >
            Save for later
          </button>
          <button
            onClick={onRemove}
            disabled={busy}
            className="text-[11px] text-slate-400 hover:text-red-600 disabled:opacity-40"
          >
            Remove
          </button>
        </div>
      </div>
    </li>
  );
}

export default CartDrawer;
