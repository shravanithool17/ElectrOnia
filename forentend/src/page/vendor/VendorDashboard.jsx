import React, { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { API_BASE, toList } from '../../lib/api';
import { formatINR } from '../../lib/money';
import { primaryImage } from '../../lib/images';
import {
  Button,
  Card,
  Badge,
  Skeleton,
  EmptyState,
  ErrorState,
  StockBadge,
} from '../../components/ui';
import StatTile from '../../components/vendor/StatTile';
import RevenueChart from '../../components/vendor/RevenueChart';
import ProductFormModal from '../../components/vendor/ProductFormModal';
import VendorOrderCard from '../../components/vendor/VendorOrderCard';
import { ORDER_TONE, ORDER_LABEL } from '../../lib/shipping';

// The order statuses the overview counts. PendingPayment never reaches a
// vendor; PartiallyShipped is a multi-seller order where someone has shipped.
const STATUSES = ['Processing', 'PartiallyShipped', 'Shipped', 'Delivered', 'Cancelled'];
const STATUS_TONE = ORDER_TONE;

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'products', label: 'Products' },
  { id: 'orders', label: 'Orders' },
];

/** Every vendor request carries the token; a failure throws with API detail. */
async function vendorFetch(path, token, options = {}) {
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      ...(options.body ? { 'Content-Type': 'application/json' } : {}),
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  const payload = await res.json().catch(() => null);

  if (!res.ok) {
    const error = new Error(payload?.error?.message || `Request failed (${res.status})`);
    error.details = payload?.error?.details;
    error.code = payload?.error?.code;
    throw error;
  }
  return payload;
}

const VendorDashboard = () => {
  const navigate = useNavigate();
  const token = localStorage.getItem('vendorToken');

  const [tab, setTab] = useState('overview');
  const [stats, setStats] = useState({ status: 'loading', data: null });
  const [products, setProducts] = useState({ status: 'loading', items: [] });
  const [orders, setOrders] = useState({ status: 'loading', items: [] });
  const [modal, setModal] = useState({ open: false, product: null });
  const [toast, setToast] = useState(null);

  const notify = useCallback((message, tone = 'success') => {
    setToast({ message, tone });
    setTimeout(() => setToast(null), 3000);
  }, []);

  useEffect(() => {
    if (!token) navigate('/loginvendor');
  }, [token, navigate]);

  /* ------------------------------------------------------------- loaders */

  const loadStats = useCallback(async () => {
    setStats({ status: 'loading', data: null });
    try {
      setStats({ status: 'ready', data: await vendorFetch('/api/v1/vendor/dashboard', token) });
    } catch (err) {
      setStats({ status: 'error', data: null, message: err.message });
    }
  }, [token]);

  const loadProducts = useCallback(async () => {
    setProducts({ status: 'loading', items: [] });
    try {
      const data = await vendorFetch('/api/v1/products/mine', token);
      setProducts({ status: 'ready', items: toList(data) });
    } catch (err) {
      setProducts({ status: 'error', items: [], message: err.message });
    }
  }, [token]);

  const loadOrders = useCallback(async () => {
    setOrders({ status: 'loading', items: [] });
    try {
      const data = await vendorFetch('/api/v1/orders/vendor', token);
      setOrders({ status: 'ready', items: Array.isArray(data) ? data : [] });
    } catch (err) {
      setOrders({ status: 'error', items: [], message: err.message });
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    loadStats();
    loadProducts();
    loadOrders();
  }, [token, loadStats, loadProducts, loadOrders]);

  /* ------------------------------------------------------------- actions */

  const saveProduct = async (payload, id) => {
    if (id) {
      await vendorFetch(`/api/v1/products/${id}`, token, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      notify('Product updated');
    } else {
      await vendorFetch('/api/v1/products', token, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      notify('Product added');
    }
    loadProducts();
    loadStats();
  };

  const deleteProduct = async (product) => {
    if (!window.confirm(`Delete “${product.title}”? This cannot be undone.`)) return;
    try {
      await vendorFetch(`/api/v1/products/${product._id}`, token, { method: 'DELETE' });
      notify('Product deleted');
      loadProducts();
      loadStats();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  /**
   * One shipping step on one order. Not optimistic: each step emails the
   * customer, so the row is replaced with what the server actually recorded.
   */
  const runOrderAction = async (orderId, action, body = {}) => {
    const MESSAGES = {
      ship: 'Marked as shipped — the customer has been emailed the tracking details',
      'out-for-delivery': 'Marked out for delivery',
      deliver: 'Marked as delivered',
      'cancel-package': 'Package cancelled — the customer has been told why',
    };
    try {
      const result = await vendorFetch(`/api/v1/orders/${orderId}/${action}`, token, {
        method: 'POST',
        body: JSON.stringify(body),
      });
      setOrders((s) => ({
        ...s,
        items: s.items.map((o) => (o._id === orderId ? result.order : o)),
      }));
      notify(MESSAGES[action]);
      loadStats();
    } catch (err) {
      notify(err.message, 'error');
      // Someone else moved it (409): show the real state rather than ours.
      if (err.code === 'ALREADY_UPDATED' || err.code === 'ILLEGAL_TRANSITION') loadOrders();
      throw err;
    }
  };

  if (!token) return null;

  return (
    <div className="flex flex-col gap-5">
      {/* --------------------------------------------------------- header */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Vendor dashboard</h1>
          <p className="text-sm text-slate-500 mt-0.5">Your products, orders and earnings</p>
        </div>
        <Button onClick={() => setModal({ open: true, product: null })}>+ Add product</Button>
      </div>

      {/* ----------------------------------------------------------- tabs */}
      <div className="border-b border-slate-200 flex gap-1" role="tablist">
        {TABS.map((item) => (
          <button
            key={item.id}
            role="tab"
            aria-selected={tab === item.id}
            onClick={() => setTab(item.id)}
            className={[
              'px-4 py-2 text-sm font-semibold border-b-2 -mb-px transition-colors',
              tab === item.id
                ? 'border-blue-600 text-blue-700'
                : 'border-transparent text-slate-500 hover:text-slate-800',
            ].join(' ')}
          >
            {item.label}
            {item.id === 'products' && products.items.length > 0 && (
              <span className="ml-1.5 text-[11px] text-slate-400">{products.items.length}</span>
            )}
            {item.id === 'orders' && orders.items.length > 0 && (
              <span className="ml-1.5 text-[11px] text-slate-400">{orders.items.length}</span>
            )}
          </button>
        ))}
      </div>

      {/* ------------------------------------------------------- overview */}
      {tab === 'overview' && (
        <OverviewTab stats={stats} onRetry={loadStats} onGoToProducts={() => setTab('products')} />
      )}

      {/* ------------------------------------------------------- products */}
      {tab === 'products' && (
        <ProductsTab
          products={products}
          onRetry={loadProducts}
          onAdd={() => setModal({ open: true, product: null })}
          onEdit={(product) => setModal({ open: true, product })}
          onDelete={deleteProduct}
        />
      )}

      {/* --------------------------------------------------------- orders */}
      {tab === 'orders' && (
        <OrdersTab orders={orders} onRetry={loadOrders} onAction={runOrderAction} />
      )}

      <ProductFormModal
        open={modal.open}
        product={modal.product}
        onClose={() => setModal({ open: false, product: null })}
        onSubmit={saveProduct}
      />

      {toast && (
        <div
          role="status"
          className={[
            'fixed bottom-6 right-6 z-50 px-4 py-2.5 rounded-lg text-sm font-medium shadow-lg',
            toast.tone === 'error' ? 'bg-red-600 text-white' : 'bg-slate-900 text-white',
          ].join(' ')}
        >
          {toast.message}
        </div>
      )}
    </div>
  );
};

/* ================================================================ Overview */

function OverviewTab({ stats, onRetry, onGoToProducts }) {
  if (stats.status === 'loading') {
    return (
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-52 rounded-xl" />
      </div>
    );
  }

  if (stats.status === 'error') return <ErrorState message={stats.message} onRetry={onRetry} />;

  const { revenue, orders, inventory, topProducts, series } = stats.data;

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          label="Revenue"
          value={revenue.totalLabel}
          sublabel={`${revenue.windowLabel} in the last ${revenue.windowDays} days`}
          icon="₹"
        />
        <StatTile
          label="Orders"
          value={orders.count}
          sublabel={`${orders.unitsSold} units · avg ${orders.averageValueLabel}`}
          icon="📦"
        />
        <StatTile
          label="Products"
          value={inventory.total}
          sublabel={`${inventory.stockValueLabel} of stock`}
          icon="🏷️"
        />
        <StatTile
          label="Needs restock"
          value={inventory.lowStock + inventory.outOfStock}
          sublabel={`${inventory.outOfStock} out of stock`}
          tone={inventory.outOfStock > 0 ? 'danger' : inventory.lowStock > 0 ? 'warning' : 'default'}
          icon="⚠️"
        />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <RevenueChart
            series={series}
            title="Revenue"
            subtitle={`Daily totals, last ${revenue.windowDays} days`}
          />
        </Card>

        <Card className="p-5 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-900">Order status</h3>
          {orders.byStatus.length === 0 ? (
            <p className="text-xs text-slate-400">No orders yet.</p>
          ) : (
            <ul className="flex flex-col gap-2">
              {STATUSES.map((status) => {
                const row = orders.byStatus.find((s) => s.status === status);
                if (!row) return null;
                return (
                  <li key={status} className="flex items-center justify-between gap-2">
                    <Badge tone={STATUS_TONE[status]}>{ORDER_LABEL[status] ?? status}</Badge>
                    <span className="text-sm font-semibold text-slate-900 tabular-nums">
                      {row.count}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5 flex flex-col gap-3">
          <h3 className="text-sm font-bold text-slate-900">Best sellers</h3>
          {topProducts.length === 0 ? (
            <p className="text-xs text-slate-400">No sales yet.</p>
          ) : (
            <ol className="flex flex-col gap-2.5">
              {topProducts.map((product, index) => (
                <li key={product.productId} className="flex items-center gap-3">
                  <span className="text-xs font-bold text-slate-300 w-4 tabular-nums">
                    {index + 1}
                  </span>
                  {(product.image || product.images?.length) && (
                    <img
                      src={primaryImage({ images: product.images ?? [product.image] })}
                      alt=""
                      className="w-9 h-9 object-contain bg-slate-50 rounded border border-slate-100 p-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 truncate">{product.title}</p>
                    <p className="text-[11px] text-slate-500">{product.units} sold</p>
                  </div>
                  <span className="text-xs font-bold text-slate-900 tabular-nums shrink-0">
                    {product.revenueLabel}
                  </span>
                </li>
              ))}
            </ol>
          )}
        </Card>

        <Card className="p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">Low stock</h3>
            <button onClick={onGoToProducts} className="text-[11px] font-semibold text-blue-600 hover:underline">
              Manage
            </button>
          </div>
          {inventory.lowStockItems.length === 0 ? (
            <p className="text-xs text-slate-400">Everything is well stocked.</p>
          ) : (
            <ul className="flex flex-col gap-2.5">
              {inventory.lowStockItems.map((item) => (
                <li key={item._id} className="flex items-center gap-3">
                  {item.image && (
                    <img
                      src={item.image}
                      alt=""
                      className="w-9 h-9 object-contain bg-slate-50 rounded border border-slate-100 p-0.5"
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-medium text-slate-900 truncate">{item.title}</p>
                    <p className="text-[11px] text-slate-500">{item.priceLabel}</p>
                  </div>
                  <StockBadge stock={item.stock} />
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}

/* ================================================================ Products */

function ProductsTab({ products, onRetry, onAdd, onEdit, onDelete }) {
  if (products.status === 'loading') {
    return (
      <Card className="p-4 flex flex-col gap-3">
        {[1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-14" />)}
      </Card>
    );
  }

  if (products.status === 'error') return <ErrorState message={products.message} onRetry={onRetry} />;

  if (products.items.length === 0) {
    return (
      <EmptyState
        icon="🏷️"
        title="No products yet"
        message="Add your first listing and it will appear in the catalogue straight away."
        action={<Button onClick={onAdd}>Add a product</Button>}
      />
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[640px]">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-left">
              <Th>Product</Th>
              <Th>Category</Th>
              <Th className="text-right">Price</Th>
              <Th className="text-right">Stock</Th>
              <Th className="text-right">Actions</Th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {products.items.map((product) => (
              <tr key={product._id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-3">
                    <img
                      src={product.images?.[0]}
                      alt=""
                      className="w-10 h-10 object-contain bg-slate-50 rounded border border-slate-100 p-0.5 shrink-0"
                    />
                    <div className="min-w-0">
                      <Link
                        to={`/products/${product._id}`}
                        className="text-sm font-medium text-slate-900 hover:text-blue-600 line-clamp-1"
                      >
                        {product.title}
                      </Link>
                      <p className="text-[11px] text-slate-500">{product.brand}</p>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <Badge>{product.category}</Badge>
                </td>
                <td className="px-4 py-3 text-right text-sm font-semibold text-slate-900 tabular-nums">
                  {product.priceLabel ?? formatINR(product.price)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex justify-end">
                    <StockBadge stock={product.stock} />
                  </div>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-1.5">
                    <Button size="sm" variant="secondary" onClick={() => onEdit(product)}>
                      Edit
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => onDelete(product)}>
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

/* ================================================================== Orders */

const ORDER_FILTERS = [
  { id: 'todo', label: 'To ship', match: (pkg) => pkg?.status === 'Pending' },
  { id: 'transit', label: 'In transit', match: (pkg) => pkg?.status === 'Shipped' || pkg?.status === 'OutForDelivery' },
  { id: 'done', label: 'Delivered', match: (pkg) => pkg?.status === 'Delivered' },
  { id: 'cancelled', label: 'Cancelled', match: (pkg) => pkg?.status === 'Cancelled' },
  { id: 'all', label: 'All', match: () => true },
];

function OrdersTab({ orders, onRetry, onAction }) {
  // "To ship" first: it is the list a seller works through every morning.
  const [filter, setFilter] = useState('todo');

  if (orders.status === 'loading') {
    return (
      <div className="flex flex-col gap-3">
        {[1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-xl" />)}
      </div>
    );
  }

  if (orders.status === 'error') return <ErrorState message={orders.message} onRetry={onRetry} />;

  if (orders.items.length === 0) {
    return (
      <EmptyState
        icon="📦"
        title="No orders yet"
        message="When a customer buys one of your products, the order appears here."
      />
    );
  }

  const counts = Object.fromEntries(
    ORDER_FILTERS.map((f) => [f.id, orders.items.filter((o) => f.match(o.fulfillments?.[0])).length])
  );
  const active = ORDER_FILTERS.find((f) => f.id === filter);
  const visible = orders.items.filter((o) => active.match(o.fulfillments?.[0]));

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Filter orders">
        {ORDER_FILTERS.map((f) => (
          <button
            key={f.id}
            role="tab"
            aria-selected={filter === f.id}
            onClick={() => setFilter(f.id)}
            className={`px-3 py-1.5 rounded text-xs font-medium border transition-colors ${
              filter === f.id
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-700 border-slate-200 hover:border-slate-400'
            }`}
          >
            {f.label}
            <span className={`ml-1.5 tabular-nums ${filter === f.id ? 'text-slate-300' : 'text-slate-400'}`}>
              {counts[f.id]}
            </span>
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-xs text-slate-500 py-8 text-center">
          {filter === 'todo' ? 'Nothing waiting to ship. 🎉' : 'No orders here.'}
        </p>
      ) : (
        visible.map((order) => <VendorOrderCard key={order._id} order={order} onAction={onAction} />)
      )}
    </div>
  );
}

function Th({ children, className = '' }) {
  return (
    <th className={`px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider text-slate-500 ${className}`}>
      {children}
    </th>
  );
}

export default VendorDashboard;
