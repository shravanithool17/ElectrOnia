// src/page/Orders.jsx — the customer's orders, tracked per package.
//
// WHAT CHANGED
//
// An order used to show one status and one timeline. But an order with items
// from two sellers is two packages, shipped separately with different
// couriers on different days — one timeline could only be wrong for one of
// them. Each package now has its own progress, courier and tracking number.
//
// This page also used raw fetch(), which skipped api()'s handling of a dead
// session: an expired login produced a bare error here instead of a sign-in.
import React, { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';

import { api } from '../lib/api';
import { formatINR } from '../lib/money';
import { primaryImage } from '../lib/images';
import {
  ORDER_LABEL,
  ORDER_TONE,
  PACKAGE_STEPS,
  PACKAGE_TONE,
  STEP_INDEX,
  shortDate,
} from '../lib/shipping';
import { Button, Card, Badge, Skeleton, EmptyState, ErrorState, Spinner } from '../components/ui';

const Orders = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const justPlaced = location.state?.placedOrderId ?? null;
  const [state, setState] = useState({ status: 'loading', orders: [] });
  const [toast, setToast] = useState(null);

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: s.orders.length ? 'refreshing' : 'loading' }));
    try {
      const orders = await api('/api/v1/orders/mine', { auth: true });
      setState({ status: 'ready', orders: Array.isArray(orders) ? orders : [] });
    } catch (err) {
      if (err.status === 401) {
        navigate('/logincustomer', { replace: true, state: { from: '/orders' } });
        return;
      }
      setState({ status: 'error', orders: [], message: err.message });
    }
  }, [navigate]);

  useEffect(() => {
    load();
  }, [load]);

  const cancel = async (orderId, reason) => {
    try {
      const result = await api(`/api/v1/orders/${orderId}/cancel`, {
        method: 'POST',
        auth: true,
        body: JSON.stringify(reason ? { reason } : {}),
      });
      setState((s) => ({ ...s, orders: s.orders.map((o) => (o._id === orderId ? result.order : o)) }));
      setToast({ tone: 'ok', message: 'Order cancelled. You will get a confirmation email.' });
    } catch (err) {
      setToast({ tone: 'error', message: err.message });
      // It shipped in the meantime: show the real state.
      if (err.code === 'CANNOT_CANCEL') load();
      throw err;
    }
  };

  if (state.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-8 w-40" />
        {[1, 2].map((i) => (
          <Card key={i} className="p-5 flex flex-col gap-3">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-2 w-full" />
            <Skeleton className="h-16 w-full" />
          </Card>
        ))}
      </div>
    );
  }

  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  if (state.orders.length === 0) {
    return (
      <EmptyState
        icon="📦"
        title="No orders yet"
        message="When you place an order it will appear here, with tracking for every package."
        action={
          <Link to="/products">
            <Button>Start shopping</Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-slate-900">Your orders</h1>
          <p className="text-sm text-slate-500 mt-0.5">
            {state.orders.length} {state.orders.length === 1 ? 'order' : 'orders'}
          </p>
        </div>
        <Button variant="secondary" onClick={load} disabled={state.status === 'refreshing'}>
          {state.status === 'refreshing' ? <Spinner /> : 'Refresh'}
        </Button>
      </div>

      {toast && (
        <p
          role="status"
          className={`text-xs rounded px-3 py-2 border ${
            toast.tone === 'error'
              ? 'text-red-800 bg-red-50 border-red-200'
              : 'text-emerald-800 bg-emerald-50 border-emerald-200'
          }`}
        >
          {toast.message}
        </p>
      )}

      {state.orders.map((order) => (
        <OrderCard key={order._id} order={order} highlight={order._id === justPlaced} onCancel={cancel} />
      ))}
    </div>
  );
};

function OrderCard({ order, highlight, onCancel }) {
  const [confirming, setConfirming] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const packages = order.fulfillments ?? [];
  const byId = new Map(order.items.map((item) => [String(item.productId), item]));
  const multiple = packages.filter((p) => p.status !== 'Cancelled').length > 1;

  const confirmCancel = async () => {
    setBusy(true);
    try {
      await onCancel(order._id, reason.trim());
      setConfirming(false);
    } catch {
      /* the page shows why */
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className={`overflow-hidden ${highlight ? 'ring-2 ring-blue-600' : ''}`}>
      {/* ---------------------------------------------------------- header */}
      <div className="px-5 py-4 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-col">
          <span className="text-[11px] font-mono text-slate-500">#{String(order._id).slice(-8).toUpperCase()}</span>
          <span className="text-xs text-slate-500">
            Placed {shortDate(order.createdAt)} ·{' '}
            {order.paymentMethod === 'COD' ? 'Cash on delivery' : 'Paid online'}
          </span>
        </div>
        <div className="flex items-center gap-3">
          <Badge tone={ORDER_TONE[order.status] ?? 'neutral'}>{ORDER_LABEL[order.status] ?? order.status}</Badge>
          <span className="text-sm font-bold text-slate-900 tabular-nums">
            {order.totalAmountLabel ?? formatINR(order.totalAmount)}
          </span>
        </div>
      </div>

      {highlight && (
        <p className="mx-5 mt-4 text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded px-3 py-2">
          Order placed. You will get an email as each package ships.
        </p>
      )}

      {order.status === 'PendingPayment' && (
        <p className="mx-5 mt-4 text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2">
          We have not received payment for this order yet. If you completed it, it will update here within a
          few minutes. If you closed the payment window, it will be cancelled automatically and nothing will
          be charged.
        </p>
      )}

      {order.payment?.needsRefund && (
        <p className="mx-5 mt-4 text-xs text-red-800 bg-red-50 border border-red-200 rounded px-3 py-2">
          Part or all of this order was cancelled after you paid. You will be refunded to your original payment
          method — no action is needed from you.
        </p>
      )}

      {/* -------------------------------------------------------- packages */}
      <div className="flex flex-col divide-y divide-slate-100">
        {packages.length === 0 ? (
          <ItemRows items={order.items} />
        ) : (
          packages.map((pkg, index) => (
            <PackageBlock
              key={pkg._id ?? index}
              pkg={pkg}
              items={(pkg.productIds ?? []).map((id) => byId.get(String(id))).filter(Boolean)}
              label={multiple ? `Package ${index + 1} of ${packages.length}` : null}
              showProgress={order.status !== 'PendingPayment'}
            />
          ))
        )}
      </div>

      {/* ---------------------------------------------------------- cancel */}
      {order.canCancel && (
        <div className="px-5 py-3 border-t border-slate-100">
          {!confirming ? (
            <button
              onClick={() => setConfirming(true)}
              className="text-xs text-slate-500 hover:text-red-700 underline-offset-2 hover:underline"
            >
              Cancel this order
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <p className="text-xs text-slate-700">
                Cancel the whole order?{' '}
                {order.paymentMethod === 'COD'
                  ? 'Nothing has been charged.'
                  : 'You paid online, so it will be refunded to your original payment method.'}
              </p>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Reason (optional)"
                maxLength={300}
                className="border border-slate-200 rounded px-3 py-2 text-xs focus:outline-none focus:border-slate-900 max-w-md"
              />
              <div className="flex gap-2">
                <Button variant="danger" onClick={confirmCancel} disabled={busy}>
                  {busy ? <Spinner /> : 'Yes, cancel it'}
                </Button>
                <Button variant="secondary" onClick={() => setConfirming(false)} disabled={busy}>
                  Keep order
                </Button>
              </div>
            </div>
          )}
        </div>
      )}
    </Card>
  );
}

function PackageBlock({ pkg, items, label, showProgress }) {
  const cancelled = pkg.status === 'Cancelled';
  const current = STEP_INDEX[pkg.status] ?? 0;
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(pkg.trackingNumber);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the number is still on screen to select */
    }
  };

  return (
    <div className="px-5 py-4 flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {label && <span className="label-mono text-slate-400">{label}</span>}
          <Badge tone={PACKAGE_TONE[pkg.status] ?? 'neutral'}>{pkg.statusLabel ?? pkg.status}</Badge>
        </div>
        {pkg.deliveredAt && <span className="text-[11px] text-slate-500">Delivered {shortDate(pkg.deliveredAt)}</span>}
      </div>

      {/* progress */}
      {showProgress && !cancelled && (
        <ol className="flex items-start" aria-label="Delivery progress">
          {PACKAGE_STEPS.map((step, index) => {
            const done = index <= current;
            const date = step.dateKey ? shortDate(pkg[step.dateKey]) : null;
            return (
              <li key={step.status} className="flex-1 flex flex-col items-center gap-1.5 relative">
                {index > 0 && (
                  <span
                    className={`absolute top-[7px] right-1/2 w-full h-0.5 ${done ? 'bg-blue-600' : 'bg-slate-200'}`}
                    aria-hidden="true"
                  />
                )}
                <span
                  className={`relative z-10 w-4 h-4 rounded-full border-2 ${
                    done ? 'bg-blue-600 border-blue-600' : 'bg-white border-slate-300'
                  }`}
                />
                <span className={`text-[10px] text-center ${done ? 'text-slate-900 font-medium' : 'text-slate-400'}`}>
                  {step.label}
                </span>
                {date && <span className="text-[10px] text-slate-400 -mt-1">{date}</span>}
              </li>
            );
          })}
        </ol>
      )}

      {cancelled && (
        <p className="text-xs text-red-700">
          Cancelled {shortDate(pkg.cancelledAt)}
          {pkg.cancelReason ? ` — ${pkg.cancelReason}` : ''}
        </p>
      )}

      {/* tracking */}
      {pkg.carrierName && !cancelled && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-xs">
          <span className="text-slate-600">{pkg.carrierName}</span>
          {pkg.trackingNumber && (
            <button
              onClick={copy}
              title="Copy tracking number"
              className="font-mono text-slate-900 bg-slate-50 border border-slate-200 rounded px-2 py-0.5 hover:border-slate-400"
            >
              {pkg.trackingNumber} <span className="text-slate-400">{copied ? '✓ copied' : '⧉'}</span>
            </button>
          )}
          {pkg.trackingUrl && (
            <a
              href={pkg.trackingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-blue-600 hover:underline"
            >
              {pkg.trackingLinkKind === 'exact' ? 'Track package ↗' : `Open ${pkg.carrierName} ↗`}
            </a>
          )}
          {pkg.trackingLinkKind === 'carrier-site' && (
            <span className="text-[11px] text-slate-400">Paste the number on their tracking page.</span>
          )}
        </div>
      )}

      <ItemRows items={items} />
    </div>
  );
}

function ItemRows({ items }) {
  return (
    <ul className="flex flex-col gap-2">
      {items.map((item, index) => (
        <li key={`${item.productId}-${index}`} className="flex items-center gap-3">
          <img
            src={primaryImage({ images: [item.image] })}
            alt=""
            className="w-11 h-11 object-contain bg-slate-50 rounded border border-slate-100 shrink-0"
          />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-medium text-slate-900 truncate">{item.title}</p>
            <p className="label-mono text-slate-400">
              {item.priceLabel ?? formatINR(item.price)} × {item.quantity}
            </p>
          </div>
          <span className="text-xs font-semibold text-slate-900 tabular-nums shrink-0">
            {item.lineTotalLabel ?? formatINR(item.price * item.quantity)}
          </span>
        </li>
      ))}
    </ul>
  );
}

export default Orders;
