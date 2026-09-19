import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import {
  Button,
  Card,
  SkeletonGrid,
  EmptyState,
  ErrorState,
  Pagination,
} from '../components/ui';
import { API_BASE, toList } from '../lib/api';
import { formatINR, toPaise } from '../lib/money';

const CATEGORIES = ['All', 'Laptops', 'Smartphones', 'Audio', 'Wearables', 'Gaming', 'Accessories'];

const SORTS = [
  { value: 'newest', label: 'Newest first' },
  { value: 'price_asc', label: 'Price: low to high' },
  { value: 'price_desc', label: 'Price: high to low' },
  { value: 'rating', label: 'Top rated' },
];

const PAGE_SIZE = 12;

const Products = () => {
  const [searchParams, setSearchParams] = useSearchParams();

  const [state, setState] = useState({ status: 'loading', items: [], total: 0, totalPages: 1 });
  const [facets, setFacets] = useState({ brands: [], priceRange: { min: 0, max: 0 } });
  const [showFilters, setShowFilters] = useState(false);

  // The URL is the single source of truth for the query. That makes a filtered
  // result shareable, and the browser back button works — it used to not.
  const category = searchParams.get('category') || 'All';
  const search = searchParams.get('search') || '';
  const sort = searchParams.get('sort') || 'newest';
  const brand = searchParams.get('brand') || '';
  const minPrice = searchParams.get('minPrice') || '';
  const maxPrice = searchParams.get('maxPrice') || '';
  const page = Number(searchParams.get('page')) || 1;

  const queryString = useMemo(() => {
    const params = new URLSearchParams();
    if (category !== 'All') params.set('category', category);
    if (search) params.set('search', search);
    if (sort) params.set('sort', sort);
    if (brand) params.set('brand', brand);
    if (minPrice) params.set('minPrice', minPrice);
    if (maxPrice) params.set('maxPrice', maxPrice);
    params.set('page', String(page));
    params.set('limit', String(PAGE_SIZE));
    return params.toString();
  }, [category, search, sort, brand, minPrice, maxPrice, page]);

  const setParam = useCallback(
    (patch) => {
      const next = new URLSearchParams(searchParams);
      for (const [key, value] of Object.entries(patch)) {
        if (value === null || value === '' || value === 'All') next.delete(key);
        else next.set(key, String(value));
      }
      // Any filter change resets to the first page — otherwise you land on
      // page 4 of a 2-page result and see nothing.
      if (!('page' in patch)) next.delete('page');
      setSearchParams(next);
    },
    [searchParams, setSearchParams]
  );

  const load = useCallback(async () => {
    setState((s) => ({ ...s, status: 'loading' }));
    try {
      const res = await fetch(`${API_BASE}/api/v1/products?${queryString}`);
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Request failed');
      const data = await res.json();
      setState({
        status: 'ready',
        items: toList(data),
        total: data.total ?? 0,
        totalPages: data.totalPages ?? 1,
      });
    } catch (err) {
      setState({ status: 'error', items: [], total: 0, totalPages: 1, message: err.message });
    }
  }, [queryString]);

  useEffect(() => {
    load();
  }, [load]);

  // Facets follow the category and search but not the brand or price, so the
  // sidebar does not remove the option you are standing on.
  useEffect(() => {
    const params = new URLSearchParams();
    if (category !== 'All') params.set('category', category);
    if (search) params.set('search', search);

    let cancelled = false;
    fetch(`${API_BASE}/api/v1/products/facets?${params}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (cancelled || !data) return;
        // Normalise rather than trusting the shape. An older backend without
        // this route, or any partial response, used to white-screen the whole
        // page on `facets.brands.length`.
        setFacets({
          brands: Array.isArray(data.brands) ? data.brands : [],
          priceRange: {
            min: Number(data.priceRange?.min) || 0,
            max: Number(data.priceRange?.max) || 0,
          },
        });
      })
      .catch(() => {
        /* The sidebar degrades to category + sort only. */
      });

    return () => {
      cancelled = true;
    };
  }, [category, search]);

  const activeFilters = [
    category !== 'All' && { key: 'category', label: category },
    brand && { key: 'brand', label: brand },
    search && { key: 'search', label: `“${search}”` },
    (minPrice || maxPrice) && {
      key: 'price',
      label: `${minPrice ? formatINR(Number(minPrice)) : '₹0'} – ${maxPrice ? formatINR(Number(maxPrice)) : 'any'}`,
    },
  ].filter(Boolean);

  const clearFilter = (key) => {
    if (key === 'price') setParam({ minPrice: null, maxPrice: null });
    else setParam({ [key]: null });
  };

  const clearAll = () => setSearchParams(new URLSearchParams());

  return (
    <div className="flex flex-col gap-5">
      {/* ---------------------------------------------------------- header */}
      <div className="flex flex-col gap-3">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">
              {search ? `Results for “${search}”` : category === 'All' ? 'All products' : category}
            </h1>
            <p className="text-sm text-slate-500 mt-0.5">
              {state.status === 'loading'
                ? 'Loading…'
                : `${state.total} ${state.total === 1 ? 'product' : 'products'}`}
              {state.totalPages > 1 && state.status === 'ready' && ` · page ${page} of ${state.totalPages}`}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="lg:hidden"
              onClick={() => setShowFilters((v) => !v)}
            >
              {showFilters ? 'Hide filters' : 'Filters'}
              {activeFilters.length > 0 && (
                <span className="ml-1 bg-blue-600 text-white rounded-full px-1.5 text-[10px]">
                  {activeFilters.length}
                </span>
              )}
            </Button>

            <label className="sr-only" htmlFor="sort">Sort products</label>
            <select
              id="sort"
              value={sort}
              onChange={(e) => setParam({ sort: e.target.value })}
              className="text-sm border border-slate-300 rounded-lg px-3 py-2 bg-white text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              {SORTS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </div>
        </div>

        {activeFilters.length > 0 && (
          <div className="flex items-center gap-2 flex-wrap">
            {activeFilters.map((filter) => (
              <button
                key={filter.key}
                onClick={() => clearFilter(filter.key)}
                className="inline-flex items-center gap-1.5 rounded-full border border-slate-300 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
              >
                {filter.label}
                <span aria-hidden="true" className="text-slate-400">✕</span>
                <span className="sr-only">Remove filter</span>
              </button>
            ))}
            <button onClick={clearAll} className="text-xs font-semibold text-blue-600 hover:underline">
              Clear all
            </button>
          </div>
        )}
      </div>

      <div className="flex gap-6 items-start">
        {/* ------------------------------------------------------- sidebar */}
        <aside
          className={`${showFilters ? 'block' : 'hidden'} lg:block w-full lg:w-60 shrink-0 lg:sticky lg:top-24`}
        >
          <Card className="p-4 flex flex-col gap-5">
            <FilterGroup title="Category">
              <div className="flex flex-col gap-0.5">
                {CATEGORIES.map((option) => (
                  <button
                    key={option}
                    onClick={() => setParam({ category: option })}
                    className={[
                      'text-left px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                      option === category
                        ? 'bg-blue-50 text-blue-700'
                        : 'text-slate-600 hover:bg-slate-100',
                    ].join(' ')}
                  >
                    {option}
                  </button>
                ))}
              </div>
            </FilterGroup>

            {facets.brands?.length > 0 && (
              <FilterGroup title="Brand">
                <div className="flex flex-col gap-0.5 max-h-56 overflow-y-auto">
                  {facets.brands.map((option) => (
                    <button
                      key={option.value}
                      onClick={() => setParam({ brand: option.value === brand ? null : option.value })}
                      className={[
                        'flex items-center justify-between px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors',
                        option.value === brand
                          ? 'bg-blue-50 text-blue-700'
                          : 'text-slate-600 hover:bg-slate-100',
                      ].join(' ')}
                    >
                      <span>{option.value}</span>
                      <span className="text-[10px] text-slate-400 tabular-nums">{option.count}</span>
                    </button>
                  ))}
                </div>
              </FilterGroup>
            )}

            <PriceFilter
              min={facets.priceRange.min}
              max={facets.priceRange.max}
              minPrice={minPrice}
              maxPrice={maxPrice}
              onApply={(next) => setParam(next)}
            />
          </Card>
        </aside>

        {/* --------------------------------------------------------- grid */}
        <div className="flex-1 min-w-0">
          {state.status === 'loading' && <SkeletonGrid count={PAGE_SIZE} />}

          {state.status === 'error' && <ErrorState message={state.message} onRetry={load} />}

          {state.status === 'ready' && state.items.length === 0 && (
            <EmptyState
              title="No products match those filters"
              message="Try widening the price range, or clearing a filter."
              action={<Button onClick={clearAll}>Clear all filters</Button>}
            />
          )}

          {state.status === 'ready' && state.items.length > 0 && (
            <>
              <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {state.items.map((product) => (
                  <ProductCard key={product._id} product={product} />
                ))}
              </div>
              <Pagination
                page={page}
                totalPages={state.totalPages}
                onChange={(next) => {
                  setParam({ page: next });
                  window.scrollTo({ top: 0, behavior: 'smooth' });
                }}
              />
            </>
          )}
        </div>
      </div>
    </div>
  );
};

function FilterGroup({ title, children }) {
  return (
    <div className="flex flex-col gap-2">
      <h2 className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{title}</h2>
      {children}
    </div>
  );
}

function PriceFilter({ min, max, minPrice, maxPrice, onApply }) {
  // Inputs are in rupees because that is what a person types; the API takes
  // paise, so the conversion happens on submit.
  const [from, setFrom] = useState(minPrice ? String(Number(minPrice) / 100) : '');
  const [to, setTo] = useState(maxPrice ? String(Number(maxPrice) / 100) : '');

  useEffect(() => {
    setFrom(minPrice ? String(Number(minPrice) / 100) : '');
    setTo(maxPrice ? String(Number(maxPrice) / 100) : '');
  }, [minPrice, maxPrice]);

  const submit = (e) => {
    e.preventDefault();
    onApply({
      minPrice: from ? toPaise(from) : null,
      maxPrice: to ? toPaise(to) : null,
    });
  };

  return (
    <FilterGroup title="Price">
      <form onSubmit={submit} className="flex flex-col gap-2">
        {max > 0 && (
          <p className="text-[11px] text-slate-400">
            Range: {formatINR(min)} – {formatINR(max)}
          </p>
        )}
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Min"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            aria-label="Minimum price in rupees"
            className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-slate-400 text-xs" aria-hidden="true">–</span>
          <input
            type="number"
            inputMode="numeric"
            min="0"
            placeholder="Max"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            aria-label="Maximum price in rupees"
            className="w-full text-xs border border-slate-300 rounded-lg px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <Button type="submit" variant="secondary" size="sm" full>Apply</Button>
      </form>
    </FilterGroup>
  );
}

export default Products;
