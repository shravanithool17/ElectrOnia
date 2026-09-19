import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useWishlist } from '../hooks/useWishlist';
import { API_BASE } from '../lib/api';
import { Button, SkeletonGrid, EmptyState } from '../components/ui';

const Wishlist = () => {
  const { ids, count } = useWishlist();
  const [state, setState] = useState({ status: 'loading', items: [] });

  const load = useCallback(async () => {
    if (ids.length === 0) {
      setState({ status: 'ready', items: [] });
      return;
    }
    setState({ status: 'loading', items: [] });

    // No bulk-by-ids endpoint yet, so fetch each saved product. Fine for a
    // handful; a `GET /products?ids=` filter is the fix when this grows.
    const results = await Promise.all(
      ids.map((id) =>
        fetch(`${API_BASE}/api/v1/products/${id}`)
          .then((res) => (res.ok ? res.json() : null))
          .catch(() => null)
      )
    );

    // A product that has since been delisted comes back null — drop it rather
    // than rendering a broken card.
    setState({ status: 'ready', items: results.filter(Boolean) });
  }, [ids]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Your wishlist</h1>
        <p className="text-sm text-slate-500 mt-0.5">
          {count === 0 ? 'Nothing saved yet' : `${count} saved ${count === 1 ? 'item' : 'items'}`}
          <span className="text-slate-400"> · saved on this device</span>
        </p>
      </div>

      {state.status === 'loading' && <SkeletonGrid count={Math.min(ids.length || 4, 8)} />}

      {state.status === 'ready' && state.items.length === 0 && (
        <EmptyState
          icon="♡"
          title="No saved items"
          message="Tap the heart on any product to keep it here for later."
          action={<Button as={Link} to="/products">Browse products</Button>}
        />
      )}

      {state.status === 'ready' && state.items.length > 0 && (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {state.items.map((product) => (
            <ProductCard key={product._id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
};

export default Wishlist;
