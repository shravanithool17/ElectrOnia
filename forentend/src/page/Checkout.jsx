// src/page/Checkout.jsx — checkout against the server's quote.
//
// WHAT CHANGED AND WHY
//
// This page used to collect a free-text address, add up the cart in the
// browser, and POST the total to /api/orders. Two problems: the total was
// whatever the client sent, and the address was four unvalidated strings that
// no other page could reuse.
//
// Now:
//   - POST /api/v1/checkout/quote returns the priced order. It writes nothing,
//     so it is re-fetched whenever the selected address changes.
//   - Addresses come from /api/v1/addresses — a real book, validated, with a
//     default, reusable on every future order.
//   - POST /api/v1/checkout/place-order reserves stock, prices the order from
//     current database prices, redeems the coupon and empties the cart. The
//     client sends an address id and a payment method. Nothing else.
//
// The page therefore has no arithmetic in it at all. Every figure below is a
// preformatted label from the API.
import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';

import { useCart } from '../context/CartContext';
import { api, toList } from '../lib/api';
import { primaryImage } from '../lib/images';
import { openCheckout } from '../lib/razorpay';
import { Button, Card, Spinner, ErrorState, MicroLabel } from '../components/ui';

const PAYMENT_METHODS = [
  {
    value: 'Razorpay',
    label: 'Pay online',
    hint: 'Card, UPI, netbanking or wallet — secured by Razorpay',
  },
  { value: 'COD', label: 'Cash on delivery', hint: 'Pay the courier when it arrives' },
];

// The server's reasons for "there is nothing to charge". See loadPricedCart.
const EMPTY_CODES = new Set(['CART_EMPTY', 'CART_ONLY_SAVED', 'CART_ONLY_UNAVAILABLE']);

const BLANK_ADDRESS = {
  label: '',
  fullName: '',
  phone: '',
  line1: '',
  line2: '',
  city: '',
  state: '',
  pincode: '',
};

const Checkout = () => {
  const { refresh: refreshCart, couponCode, applyCoupon, removeCoupon, setIsCartOpen } = useCart();
  const navigate = useNavigate();

  const [addresses, setAddresses] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [quote, setQuote] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [loadError, setLoadError] = useState(null);
  const [quoting, setQuoting] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState(null);
  const [paymentMethod, setPaymentMethod] = useState('Razorpay');
  const [showForm, setShowForm] = useState(false);
  const [couponDraft, setCouponDraft] = useState('');
  const [couponError, setCouponError] = useState(null);
  const [paymentStage, setPaymentStage] = useState(null); // open | verifying

  // ------------------------------------------------------------- addresses
  const loadAddresses = useCallback(async () => {
    const data = await api('/api/v1/addresses', { auth: true });
    const items = toList(data);
    setAddresses(items);
    // Prefer the saved default; otherwise the first one. Never leave the
    // selection null while addresses exist, or the quote comes back with an
    // addressError the customer did not cause.
    setSelectedId((current) => {
      if (current && items.some((a) => a._id === current)) return current;
      return items.find((a) => a.isDefault)?._id ?? items[0]?._id ?? null;
    });
    return items;
  }, []);

  // --------------------------------------------------------------- quoting
  const loadQuote = useCallback(async (addressId) => {
    setQuoting(true);
    try {
      const next = await api('/api/v1/checkout/quote', {
        method: 'POST',
        auth: true,
        body: JSON.stringify(addressId ? { addressId } : {}),
      });
      setQuote(next);
      return next;
    } catch (err) {
      // "Nothing to charge" is a normal state with three different causes,
      // not an error — the server says which one in err.code. The message
      // match stays for an API that predates the codes.
      if (EMPTY_CODES.has(err.code) || (err.message && /empty/i.test(err.message))) {
        const emptyQuote = { items: [], emptyReason: err.code ?? 'CART_EMPTY', emptyMessage: err.message };
        setQuote(emptyQuote);
        return emptyQuote;
      }
      throw err;
    } finally {
      setQuoting(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setStatus('loading');
      try {
        const items = await loadAddresses();
        const initial = items.find((a) => a.isDefault)?._id ?? items[0]?._id ?? null;
        await loadQuote(initial);
        if (!cancelled) {
          setStatus('ready');
          setLoadError(null);
          setShowForm(items.length === 0);
        }
      } catch (err) {
        if (cancelled) return;
        // A dead session is not an error to retry — the token has already been
        // dropped by api(), so send them to sign in and back here after.
        if (err.status === 401) {
          navigate('/logincustomer', { replace: true, state: { from: '/checkout', reason: 'session-expired' } });
          return;
        }
        setStatus('error');
        setLoadError(err.message || 'Could not load checkout');
      }
    })();

    // The drawer and this page must describe the same cart. Re-reading it
    // here means whatever the drawer shows next is what was just priced.
    refreshCart();

    return () => {
      cancelled = true;
    };
  }, [loadAddresses, loadQuote, navigate, refreshCart]);

  // Re-quote when the address changes: shipping and tax can depend on it.
  const selectAddress = async (id) => {
    setSelectedId(id);
    setPlaceError(null);
    try {
      await loadQuote(id);
    } catch (err) {
      setPlaceError(err.message);
    }
  };

  const handleCreateAddress = async (values) => {
    const created = await api('/api/v1/addresses', {
      method: 'POST',
      auth: true,
      body: JSON.stringify(values),
    });
    await loadAddresses();
    setShowForm(false);
    await selectAddress(created._id);
  };

  const handleCoupon = async (event) => {
    event.preventDefault();
    const code = couponDraft.trim();
    if (!code) return;
    setCouponError(null);
    try {
      await applyCoupon(code);
      setCouponDraft('');
      await loadQuote(selectedId);
    } catch (err) {
      setCouponError(err.message);
    }
  };

  const handleRemoveCoupon = async () => {
    setCouponError(null);
    await removeCoupon();
    await loadQuote(selectedId);
  };

  const handlePlaceOrder = async () => {
    setPlacing(true);
    setPlaceError(null);
    try {
      // 1. The order is created first, in either case. For an online payment
      //    it is created in PendingPayment with its stock reserved, so the
      //    thing being paid for cannot sell out mid-payment.
      const res = await api('/api/v1/checkout/place-order', {
        method: 'POST',
        auth: true,
        body: JSON.stringify({ addressId: selectedId, paymentMethod }),
      });
      const order = res?.order ?? res;
      const orderId = order?._id ?? res?._id;

      if (!orderId) {
        throw new Error('Order creation failed: missing order identifier');
      }

      if (paymentMethod === 'Razorpay') {
        // 2. Ask the server to open a payment. Only the server talks to
        //    Razorpay's API; the browser gets the public key id and an order
        //    id, never a secret.
        const intent = await api('/api/v1/payments/razorpay/intent', {
          method: 'POST',
          auth: true,
          body: JSON.stringify({ orderId }),
        });

        setPaymentStage('open');

        // 3. The modal. What it resolves with is three ids and a signature —
        //    not proof of anything until the server checks it.
        const result = await openCheckout(intent.checkout);

        setPaymentStage('verifying');

        // 4. The server verifies the signature AND re-reads the amount from
        //    Razorpay before marking anything paid.
        await api('/api/v1/payments/razorpay/confirm', {
          method: 'POST',
          auth: true,
          body: JSON.stringify(result),
        });
      }

      // The server emptied the cart; pull the new state before navigating so
      // the header count is right the moment the orders page renders.
      await refreshCart();
      navigate('/orders', { state: { placedOrderId: orderId } });
    } catch (err) {
      setPaymentStage(null);

      if (err.cancelled) {
        // Closing the Razorpay window is a normal thing to do. Nothing was
        // charged and — now that the cart is only cleared once payment is
        // confirmed — nothing was taken out of the cart either. Pressing Pay
        // again starts a fresh attempt; the server cancels this one and puts
        // its reserved stock back first.
        //
        // (This used to promise "pay for it from your orders page". There is
        // no such button, and the cart had already been emptied.)
        setPlaceError(
          err.declined
            ? `${err.message} Your cart is unchanged — press Pay to try again, or choose another method.`
            : 'Payment cancelled. Nothing was charged and your cart is unchanged — press Pay to try again.'
        );
        await refreshCart();
        setPlacing(false);
        return;
      }

      setPlaceError(err.message || 'Could not place your order');
      // A 409 means stock moved under us — the cart notices explain which line.
      await refreshCart();
      if (err.code === 'INSUFFICIENT_STOCK') {
        try {
          await loadQuote(selectedId);
        } catch {
          /* the error above is the one worth showing */
        }
      }
    } finally {
      setPlacing(false);
    }
  };

  // ----------------------------------------------------------------- views
  if (status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <div className="h-8 w-48 bg-slate-100 rounded animate-pulse" />
        <div className="grid lg:grid-cols-[1fr_380px] gap-6">
          <div className="h-80 bg-slate-100 rounded animate-pulse" />
          <div className="h-64 bg-slate-100 rounded animate-pulse" />
        </div>
      </div>
    );
  }

  if (status === 'error') {
    return <ErrorState message={loadError} onRetry={() => window.location.reload()} />;
  }

  // An empty cart is a validation error from the quote endpoint, not a crash.
  if (!quote || quote.items.length === 0) {
    // Three different situations used to share this one screen and the words
    // "your cart is empty" — including two where the drawer plainly showed
    // items. Each now says what is actually going on and what to do.
    const reason = quote?.emptyReason ?? 'CART_EMPTY';
    const copy = {
      CART_EMPTY: {
        title: 'There is nothing to check out',
        body: 'Your cart is empty. Anything you add is kept on your account, so it will still be here next time you sign in.',
        cta: null,
      },
      CART_ONLY_SAVED: {
        title: 'Everything is saved for later',
        body: quote?.emptyMessage,
        cta: 'Open cart',
      },
      CART_ONLY_UNAVAILABLE: {
        title: 'Nothing in your cart can be bought right now',
        body: quote?.emptyMessage,
        cta: 'Open cart',
      },
    }[reason] ?? { title: 'There is nothing to check out', body: quote?.emptyMessage, cta: null };

    return (
      <Card className="p-12 flex flex-col items-center gap-3 text-center">
        <span className="text-3xl" aria-hidden="true">🛒</span>
        <h1 className="font-display text-lg font-semibold text-slate-900">{copy.title}</h1>
        <p className="text-sm text-slate-500 max-w-sm">{copy.body}</p>
        <div className="flex gap-2 mt-1">
          {copy.cta && <Button onClick={() => setIsCartOpen(true)}>{copy.cta}</Button>}
          <Link to="/products">
            <Button variant={copy.cta ? 'secondary' : undefined}>Browse products</Button>
          </Link>
        </div>
      </Card>
    );
  }

  const { summary } = quote;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between gap-4">
        <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">
          Checkout
        </h1>
        {quoting && (
          <span className="flex items-center gap-2 label-mono text-slate-400">
            <Spinner className="w-3 h-3" /> repricing
          </span>
        )}
      </div>

      <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
        {/* ==================================================== left column */}
        <div className="flex flex-col gap-5">
          {/* ------------------------------------------------ address book */}
          <Card className="p-5 flex flex-col gap-4">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-900">Deliver to</h2>
              {addresses.length > 0 && !showForm && (
                <button
                  onClick={() => setShowForm(true)}
                  className="text-xs font-semibold text-blue-600 hover:underline"
                >
                  + Add address
                </button>
              )}
            </div>

            {quote.addressError && !showForm && (
              <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
                {quote.addressError}
              </p>
            )}

            {addresses.length > 0 && (
              <ul className="flex flex-col gap-2.5">
                {addresses.map((address) => (
                  <li key={address._id}>
                    <label
                      className={`flex gap-3 items-start p-3 rounded border cursor-pointer transition-colors ${
                        selectedId === address._id
                          ? 'border-slate-900 bg-slate-50'
                          : 'border-slate-200 hover:border-slate-400'
                      }`}
                    >
                      <input
                        type="radio"
                        name="address"
                        value={address._id}
                        checked={selectedId === address._id}
                        onChange={() => selectAddress(address._id)}
                        className="mt-0.5 accent-blue-600"
                      />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-xs font-semibold text-slate-900">
                            {address.fullName}
                          </span>
                          {address.label && (
                            <span className="label-mono text-slate-400">{address.label}</span>
                          )}
                          {address.isDefault && (
                            <span className="text-[10px] font-semibold uppercase tracking-wide bg-slate-900 text-white px-1.5 py-0.5 rounded">
                              Default
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-slate-600 mt-0.5">{address.oneLine}</p>
                        <p className="label-mono text-slate-400 mt-0.5">{address.phone}</p>
                      </div>
                    </label>
                  </li>
                ))}
              </ul>
            )}

            {showForm && (
              <AddressForm
                onSubmit={handleCreateAddress}
                onCancel={addresses.length > 0 ? () => setShowForm(false) : null}
                isFirst={addresses.length === 0}
              />
            )}
          </Card>

          {/* ----------------------------------------------------- payment */}
          <Card className="p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-900">Payment</h2>
            <ul className="flex flex-col gap-2.5">
              {PAYMENT_METHODS.map((method) => (
                <li key={method.value}>
                  <label
                    className={`flex gap-3 items-start p-3 rounded border cursor-pointer transition-colors ${
                      paymentMethod === method.value
                        ? 'border-slate-900 bg-slate-50'
                        : 'border-slate-200 hover:border-slate-400'
                    }`}
                  >
                    <input
                      type="radio"
                      name="payment"
                      value={method.value}
                      checked={paymentMethod === method.value}
                      onChange={() => setPaymentMethod(method.value)}
                      className="mt-0.5 accent-blue-600"
                    />
                    <div>
                      <p className="text-xs font-semibold text-slate-900">{method.label}</p>
                      <p className="text-[11px] text-slate-500">{method.hint}</p>
                      {method.value === 'Razorpay' && import.meta.env.DEV && (
                        <div className="mt-2 text-[11px] bg-amber-50 border border-amber-200 text-amber-800 rounded p-2.5 space-y-1">
                          <p className="font-semibold text-amber-900">🧪 Razorpay Test Mode:</p>
                          <p className="text-[10.5px]">
                            Real bank cards fail and redirect to a blank screen in test mode. Use Razorpay test credentials:
                          </p>
                          <p className="font-mono text-[10.5px]">
                            Card: <span className="font-bold bg-amber-100 px-1 py-0.5 rounded">4111 1111 1111 1111</span> · Exp: <span className="font-bold bg-amber-100 px-1 py-0.5 rounded">12/28</span> · CVV: <span className="font-bold bg-amber-100 px-1 py-0.5 rounded">123</span>
                          </p>
                          <p className="font-mono text-[10.5px]">
                            UPI: <span className="font-bold bg-amber-100 px-1 py-0.5 rounded">success@razorpay</span>
                          </p>
                        </div>
                      )}
                    </div>
                  </label>
                </li>
              ))}
            </ul>
          </Card>

          {/* ------------------------------------------------------- lines */}
          <Card className="p-5 flex flex-col gap-3">
            <h2 className="text-sm font-semibold text-slate-900">
              {quote.items.length} {quote.items.length === 1 ? 'item' : 'items'}
            </h2>
            <ul className="flex flex-col divide-y divide-slate-100">
              {quote.items.map((line) => (
                <li key={line.productId} className="flex gap-3 items-center py-3 first:pt-0 last:pb-0">
                  <img
                    src={primaryImage({ images: [line.image] })}
                    alt={line.title}
                    className="w-12 h-12 object-contain bg-slate-50 rounded border border-slate-100 shrink-0"
                  />
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-medium text-slate-900 truncate">{line.title}</p>
                    <p className="label-mono text-slate-400">
                      {line.unitPriceLabel} × {line.quantity}
                    </p>
                  </div>
                  <p className="font-mono text-xs font-semibold text-slate-900 tabular-nums shrink-0">
                    {line.lineTotalLabel}
                  </p>
                </li>
              ))}
            </ul>
          </Card>
        </div>

        {/* =================================================== right column */}
        <Card className="p-5 flex flex-col gap-4 lg:sticky lg:top-6">
          <MicroLabel>Order summary</MicroLabel>

          {/* ------------------------------------------------------ coupon */}
          {summary.appliedCoupon || couponCode ? (
            <div className="flex items-center justify-between gap-3 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-emerald-800 font-mono">
                  {summary.appliedCoupon ?? couponCode}
                </p>
                <p className="text-[11px] text-emerald-700">
                  {summary.discountTotal.amount > 0
                    ? `${summary.discountTotal.label} off`
                    : 'Not applied to this order'}
                </p>
              </div>
              <button
                onClick={handleRemoveCoupon}
                className="text-[11px] font-semibold text-emerald-800 hover:underline shrink-0"
              >
                Remove
              </button>
            </div>
          ) : (
            <form onSubmit={handleCoupon} className="flex flex-col gap-1.5">
              <div className="flex gap-2">
                <input
                  value={couponDraft}
                  onChange={(event) => setCouponDraft(event.target.value.toUpperCase())}
                  placeholder="Coupon code"
                  aria-label="Coupon code"
                  className="flex-1 min-w-0 border border-slate-200 rounded px-3 py-2 text-xs font-mono uppercase placeholder:font-sans placeholder:normal-case focus:outline-none focus:border-slate-900"
                />
                <Button type="submit" variant="secondary" disabled={!couponDraft.trim()}>
                  Apply
                </Button>
              </div>
              {couponError && <p className="text-[11px] text-red-600">{couponError}</p>}
            </form>
          )}

          {/* ------------------------------------------------------ totals */}
          <dl className="flex flex-col gap-2 text-xs">
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
            <div className="flex items-baseline justify-between pt-3 mt-1 border-t border-slate-200">
              <dt className="text-sm font-semibold text-slate-900">Payable now</dt>
              <dd className="font-mono text-lg font-semibold text-slate-900 tabular-nums">
                {quote.payableNow.label}
              </dd>
            </div>
          </dl>

          {placeError && (
            <p className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-3 py-2">
              {placeError}
            </p>
          )}

          <Button
            className="w-full"
            onClick={handlePlaceOrder}
            disabled={placing || quoting || !selectedId || Boolean(quote.addressError)}
          >
            {placing ? (
              <span className="flex items-center gap-2">
                <Spinner />
                {paymentStage === 'open'
                  ? 'Waiting for payment…'
                  : paymentStage === 'verifying'
                    ? 'Confirming payment…'
                    : 'Placing order…'}
              </span>
            ) : paymentMethod === 'Razorpay' ? (
              `Pay ${quote.payableNow.label}`
            ) : (
              `Place order · ${quote.payableNow.label}`
            )}
          </Button>

          <p className="text-[11px] text-slate-400 leading-relaxed">
            Totals are calculated on the server from current prices, and GST is applied to the
            discounted value.
            {summary.freeShipping
              ? ' Shipping on this order is free.'
              : ` Add ${summary.amountToFreeShipping.label} for free shipping.`}
          </p>
        </Card>
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

/**
 * The address form mirrors the server's zod schema field for field, so a valid
 * form is a valid request. Server-side validation errors still come back keyed
 * by field and are rendered inline rather than as one opaque message.
 */
function AddressForm({ onSubmit, onCancel, isFirst }) {
  const [values, setValues] = useState(BLANK_ADDRESS);
  const [fieldErrors, setFieldErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [saving, setSaving] = useState(false);

  const set = (name) => (event) => {
    setValues((current) => ({ ...current, [name]: event.target.value }));
    setFieldErrors((current) => ({ ...current, [name]: undefined }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setSaving(true);
    setFormError(null);
    setFieldErrors({});

    // Optional fields must be omitted, not sent empty — the schema caps their
    // length but does not accept ''.
    const payload = Object.fromEntries(
      Object.entries(values).filter(([, value]) => String(value).trim() !== '')
    );

    try {
      await onSubmit(payload);
    } catch (err) {
      const details = err.details ?? [];
      if (details.length) {
        setFieldErrors(Object.fromEntries(details.map((d) => [d.field, d.message])));
      } else {
        setFormError(err.message || 'Could not save this address');
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-3 border-t border-slate-200 pt-4">
      {isFirst && (
        <p className="text-xs text-slate-500">
          Your first address becomes your default. You can save up to ten.
        </p>
      )}

      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Full name" error={fieldErrors.fullName}>
          <input value={values.fullName} onChange={set('fullName')} required className={INPUT} />
        </Field>
        <Field label="Phone" error={fieldErrors.phone}>
          <input
            value={values.phone}
            onChange={set('phone')}
            required
            inputMode="tel"
            className={INPUT}
          />
        </Field>
      </div>

      <Field label="Address line 1" error={fieldErrors.line1}>
        <input value={values.line1} onChange={set('line1')} required className={INPUT} />
      </Field>
      <Field label="Address line 2" optional error={fieldErrors.line2}>
        <input value={values.line2} onChange={set('line2')} className={INPUT} />
      </Field>

      <div className="grid sm:grid-cols-3 gap-3">
        <Field label="City" error={fieldErrors.city}>
          <input value={values.city} onChange={set('city')} required className={INPUT} />
        </Field>
        <Field label="State" error={fieldErrors.state}>
          <input value={values.state} onChange={set('state')} required className={INPUT} />
        </Field>
        <Field label="PIN code" error={fieldErrors.pincode}>
          <input
            value={values.pincode}
            onChange={set('pincode')}
            required
            inputMode="numeric"
            maxLength={6}
            className={`${INPUT} font-mono`}
          />
        </Field>
      </div>

      <Field label="Label" optional error={fieldErrors.label}>
        <input value={values.label} onChange={set('label')} placeholder="Home, Hostel, Office" className={INPUT} />
      </Field>

      {formError && <p className="text-[11px] text-red-600">{formError}</p>}

      <div className="flex gap-2">
        <Button type="submit" disabled={saving}>
          {saving ? 'Saving…' : 'Save address'}
        </Button>
        {onCancel && (
          <Button type="button" variant="secondary" onClick={onCancel} disabled={saving}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

const INPUT =
  'w-full border border-slate-200 rounded px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-900';

function Field({ label, optional, error, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-mono text-slate-400">
        {label}
        {optional && <span className="normal-case tracking-normal"> (optional)</span>}
      </span>
      {children}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </label>
  );
}

export default Checkout;
