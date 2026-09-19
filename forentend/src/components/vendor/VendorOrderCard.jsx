// src/components/vendor/VendorOrderCard.jsx — one order, from the seller's side.
//
// WHAT CHANGED
//
// Each order row used to carry a dropdown of every status. Any vendor on the
// order could set the WHOLE order to anything — Delivered → Pending, Shipped
// with nothing to track — and it moved every other vendor's items with it.
//
// Now the seller sees THEIR package and only the next legal step:
//
//   Being packed    →  "Mark shipped" (courier + tracking number required)
//                      "Cancel package" (reason required; the customer is told)
//   Shipped         →  "Out for delivery"  ·  "Mark delivered"
//   Out for delivery→  "Mark delivered"
//   Delivered / Cancelled → nothing left to do
//
// Nothing here is optimistic. Each step emails the customer, so the row
// updates from the server's answer rather than guessing ahead of it.
import React, { useState } from 'react';

import { primaryImage } from '../../lib/images';
import { formatINR } from '../../lib/money';
import {
  CARRIER_OPTIONS,
  PACKAGE_TONE,
  PACKAGE_STEPS,
  STEP_INDEX,
  shortDate,
} from '../../lib/shipping';
import { Button, Card, Badge, Spinner } from '../ui';

const INPUT =
  'w-full border border-slate-200 rounded px-3 py-2 text-xs text-slate-900 focus:outline-none focus:border-slate-900';

export default function VendorOrderCard({ order, onAction }) {
  const pkg = order.fulfillments?.[0] ?? null;
  const [panel, setPanel] = useState(null); // 'ship' | 'cancel' | null
  const [busy, setBusy] = useState(null);

  const run = async (action, body = {}) => {
    setBusy(action);
    try {
      await onAction(order._id, action, body);
      setPanel(null);
    } catch {
      // onAction has already shown the reason; keep the form open to fix it.
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="overflow-hidden">
      {/* ---------------------------------------------------------- header */}
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div>
          <span className="text-[11px] font-mono text-slate-500">
            #{String(order._id).slice(-8).toUpperCase()}
          </span>
          <p className="text-xs text-slate-500">
            {order.customerName} · {shortDate(order.createdAt)} ·{' '}
            {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {pkg ? (
            <Badge tone={PACKAGE_TONE[pkg.status] ?? 'neutral'}>{pkg.statusLabel}</Badge>
          ) : (
            <Badge tone="neutral">{order.status}</Badge>
          )}
          <span className="text-sm font-bold text-slate-900 tabular-nums">{order.totalAmountLabel}</span>
        </div>
      </div>

      {/* ----------------------------------------------------------- lines */}
      <div className="px-4 py-3 flex flex-col gap-2">
        {order.items.map((item, index) => (
          <div key={`${item.productId}-${index}`} className="flex items-center gap-3">
            <img
              src={primaryImage({ images: [item.image] })}
              alt=""
              className="w-9 h-9 object-contain bg-slate-50 rounded border border-slate-100 p-0.5 shrink-0"
            />
            <p className="text-xs text-slate-800 flex-1 min-w-0 truncate">{item.title}</p>
            <span className="text-xs text-slate-500 shrink-0">× {item.quantity}</span>
            <span className="text-xs font-semibold text-slate-900 shrink-0 tabular-nums">
              {item.lineTotalLabel ?? formatINR(item.price * item.quantity)}
            </span>
          </div>
        ))}
      </div>

      {/* ---------------------------------------------------- ship to / progress */}
      <div className="px-4 py-3 border-t border-slate-100 grid sm:grid-cols-2 gap-3">
        <div className="text-[11px] text-slate-600 leading-relaxed">
          <p className="label-mono text-slate-400 mb-0.5">Ship to</p>
          {order.customerName}
          <br />
          {order.shippingAddress?.street}, {order.shippingAddress?.city} {order.shippingAddress?.zipCode}
          <br />
          {order.shippingAddress?.phone}
        </div>

        {pkg && pkg.status !== 'Cancelled' && <Progress pkg={pkg} />}
        {pkg?.status === 'Cancelled' && (
          <p className="text-[11px] text-red-700">
            Cancelled {shortDate(pkg.cancelledAt)}
            {pkg.cancelReason ? ` — ${pkg.cancelReason}` : ''}
          </p>
        )}
      </div>

      {/* ----------------------------------------------------------- actions */}
      {pkg && (
        <div className="px-4 py-3 border-t border-slate-100 bg-white">
          {pkg.status === 'Pending' && panel === null && (
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => setPanel('ship')}>Mark shipped</Button>
              <Button variant="secondary" onClick={() => setPanel('cancel')}>
                Cancel package
              </Button>
            </div>
          )}

          {panel === 'ship' && (
            <ShipForm busy={busy === 'ship'} onCancel={() => setPanel(null)} onSubmit={(body) => run('ship', body)} />
          )}

          {panel === 'cancel' && (
            <CancelForm
              paidOnline={order.paymentMethod !== 'COD'}
              busy={busy === 'cancel-package'}
              onCancel={() => setPanel(null)}
              onSubmit={(body) => run('cancel-package', body)}
            />
          )}

          {(pkg.status === 'Shipped' || pkg.status === 'OutForDelivery') && (
            <div className="flex flex-wrap items-center gap-2">
              {pkg.status === 'Shipped' && (
                <Button variant="secondary" disabled={Boolean(busy)} onClick={() => run('out-for-delivery')}>
                  {busy === 'out-for-delivery' ? <Spinner /> : 'Out for delivery'}
                </Button>
              )}
              <Button disabled={Boolean(busy)} onClick={() => run('deliver')}>
                {busy === 'deliver' ? <Spinner /> : 'Mark delivered'}
              </Button>
              {order.paymentMethod === 'COD' && (
                <span className="text-[11px] text-slate-500">
                  Collect {order.totalAmountLabel} in cash on delivery.
                </span>
              )}
            </div>
          )}

          {(pkg.status === 'Delivered' || pkg.status === 'Cancelled') && (
            <p className="text-[11px] text-slate-500">Nothing left to do for this order.</p>
          )}
        </div>
      )}

      {!pkg && (
        <p className="px-4 py-3 border-t border-slate-100 text-[11px] text-amber-800 bg-amber-50">
          This order predates package tracking. Run <code>npm run orders:backfill -- --apply</code> in the
          backend to make it shippable.
        </p>
      )}
    </Card>
  );
}

function Progress({ pkg }) {
  const current = STEP_INDEX[pkg.status] ?? 0;
  return (
    <div className="flex flex-col gap-2">
      <ol className="flex items-center gap-1" aria-label="Shipping progress">
        {PACKAGE_STEPS.map((step, index) => (
          <li key={step.status} className="flex-1 flex flex-col gap-1">
            <span className={`h-1 rounded-full ${index <= current ? 'bg-blue-600' : 'bg-slate-200'}`} />
            <span className={`text-[10px] ${index <= current ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
              {step.label}
              {step.dateKey && pkg[step.dateKey] ? ` · ${shortDate(pkg[step.dateKey])}` : ''}
            </span>
          </li>
        ))}
      </ol>
      {pkg.carrierName && (
        <p className="text-[11px] text-slate-600">
          {pkg.carrierName}
          {pkg.trackingNumber && (
            <>
              {' · '}
              <span className="font-mono">{pkg.trackingNumber}</span>
            </>
          )}
        </p>
      )}
    </div>
  );
}

function ShipForm({ busy, onSubmit, onCancel }) {
  const [values, setValues] = useState({ carrier: 'delhivery', carrierName: '', trackingNumber: '', trackingUrl: '' });
  const [errors, setErrors] = useState({});
  const set = (key) => (event) => {
    setValues((v) => ({ ...v, [key]: event.target.value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const self = values.carrier === 'self';
  const other = values.carrier === 'other';

  const submit = async (event) => {
    event.preventDefault();
    // Mirrors the server's rules so the common mistakes are caught before a
    // round trip; the server still has the final word.
    const next = {};
    if (!self && !/^[A-Za-z0-9-]{6,40}$/.test(values.trackingNumber.trim())) {
      next.trackingNumber = 'Enter the tracking (AWB) number from the courier — 6 to 40 letters or digits.';
    }
    if (other && values.carrierName.trim().length < 2) next.carrierName = 'Name the courier.';
    if (values.trackingUrl && !values.trackingUrl.trim().startsWith('https://')) {
      next.trackingUrl = 'The link must start with https://';
    }
    setErrors(next);
    if (Object.keys(next).length) return;

    const body = { carrier: values.carrier };
    if (!self) body.trackingNumber = values.trackingNumber.trim();
    if (other) body.carrierName = values.carrierName.trim();
    if (values.trackingUrl.trim()) body.trackingUrl = values.trackingUrl.trim();
    onSubmit(body);
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <div className="grid sm:grid-cols-2 gap-3">
        <Field label="Courier">
          <select value={values.carrier} onChange={set('carrier')} className={INPUT}>
            {CARRIER_OPTIONS.map((c) => (
              <option key={c.value} value={c.value}>
                {c.label}
              </option>
            ))}
          </select>
        </Field>

        {other && (
          <Field label="Courier name" error={errors.carrierName}>
            <input value={values.carrierName} onChange={set('carrierName')} className={INPUT} />
          </Field>
        )}

        {!self && (
          <Field label="Tracking / AWB number" error={errors.trackingNumber}>
            <input
              value={values.trackingNumber}
              onChange={set('trackingNumber')}
              className={`${INPUT} font-mono`}
              autoComplete="off"
            />
          </Field>
        )}
      </div>

      {!self && (
        <Field
          label="Tracking link (optional)"
          hint="Paste the link the courier gave you. Without it, the customer is sent to the courier's site with the number to paste."
          error={errors.trackingUrl}
        >
          <input
            value={values.trackingUrl}
            onChange={set('trackingUrl')}
            placeholder="https://"
            className={INPUT}
            inputMode="url"
          />
        </Field>
      )}

      <div className="flex items-center gap-2">
        <Button type="submit" disabled={busy}>
          {busy ? <Spinner /> : 'Confirm shipped'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Back
        </Button>
        <span className="text-[11px] text-slate-500">The customer is emailed the tracking details.</span>
      </div>
    </form>
  );
}

function CancelForm({ busy, paidOnline, onSubmit, onCancel }) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);

  const submit = (event) => {
    event.preventDefault();
    if (reason.trim().length < 5) {
      setError('Tell the customer why — at least a few words.');
      return;
    }
    onSubmit({ reason: reason.trim() });
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3">
      <Field
        label="Reason for cancelling"
        hint={`The customer sees this.${paidOnline ? ' They paid online, so the order is flagged for a refund.' : ''} Stock is returned to your inventory.`}
        error={error}
      >
        <input
          value={reason}
          onChange={(e) => {
            setReason(e.target.value);
            setError(null);
          }}
          placeholder="e.g. Damaged in our warehouse — no replacement in stock"
          className={INPUT}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={busy}>
          {busy ? <Spinner /> : 'Cancel this package'}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel} disabled={busy}>
          Keep it
        </Button>
      </div>
    </form>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="label-mono text-slate-400">{label}</span>
      {children}
      {hint && !error && <span className="text-[11px] text-slate-500 leading-snug">{hint}</span>}
      {error && <span className="text-[11px] text-red-600">{error}</span>}
    </label>
  );
}
