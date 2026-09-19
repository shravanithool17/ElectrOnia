import React, { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import ProductCard from '../components/ProductCard';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../hooks/useWishlist';
import { API_BASE, toList } from '../lib/api';
import { formatINR, discountPercent } from '../lib/money';
import { productImages } from '../lib/images';
import {
  Button,
  Card,
  Badge,
  StockBadge,
  Rating,
  QuantityStepper,
  Skeleton,
  ErrorState,
  Breadcrumb,
} from '../components/ui';


const ProductDetails = () => {
  const { id } = useParams();
  const { addToCart, setIsCartOpen } = useCart();
  const { has, toggle } = useWishlist();

  const [state, setState] = useState({ status: 'loading', product: null });
  const [related, setRelated] = useState([]);
  const [quantity, setQuantity] = useState(1);
  const [activeImage, setActiveImage] = useState(0);

  const load = useCallback(async () => {
    setState({ status: 'loading', product: null });
    try {
      const res = await fetch(`${API_BASE}/api/v1/products/${id}`);
      if (!res.ok) throw new Error((await res.json())?.error?.message || 'Product not found');
      setState({ status: 'ready', product: await res.json() });
    } catch (err) {
      setState({ status: 'error', product: null, message: err.message });
    }
  }, [id]);

  useEffect(() => {
    setQuantity(1);
    setActiveImage(0);
    load();
  }, [load]);

  // Related products are a separate request so a slow or empty result never
  // holds up the page the shopper actually asked for.
  useEffect(() => {
    let cancelled = false;
    fetch(`${API_BASE}/api/v1/products/${id}/related`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled && data) setRelated(toList(data));
      })
      .catch(() => setRelated([]));
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (state.status === 'loading') return <DetailSkeleton />;
  if (state.status === 'error') return <ErrorState message={state.message} onRetry={load} />;

  const product = state.product;
  // Three views per product (front / angle / detail), resolved against the
  // API origin. Never empty, so the thumbnail strip always has something.
  const images = productImages(product);
  const discount = discountPercent(product.originalPrice, product.price);
  const outOfStock = product.stock <= 0;
  const saved = has(product._id);
  const specs = Object.entries(product.specifications ?? {});

  const handleAdd = () => {
    addToCart(product, quantity);
    setIsCartOpen(true);
  };

  return (
    <div className="flex flex-col gap-10">
      <Breadcrumb
        items={[
          { label: 'Home', to: '/' },
          { label: product.category, to: `/products?category=${product.category}` },
          { label: product.title },
        ]}
      />

      <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
        {/* ------------------------------------------------------- gallery */}
        <div className="flex flex-col gap-3">
          <div className="group bg-slate-50 rounded-[28px] aspect-square flex items-center justify-center overflow-hidden">
            <img
              src={images[activeImage]}
              alt={`${product.title} — view ${activeImage + 1}`}
              className="product-shadow w-full h-full object-contain p-10 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.04]"
            />
          </div>

          {images.length > 1 && (
            <div className="flex gap-2 overflow-x-auto pb-1">
              {images.map((src, index) => (
                <button
                  key={src + index}
                  onClick={() => setActiveImage(index)}
                  aria-label={`View image ${index + 1}`}
                  aria-current={index === activeImage}
                  className={[
                    'w-16 h-16 shrink-0 rounded-2xl border-2 bg-slate-50 overflow-hidden transition-colors',
                    index === activeImage ? 'border-blue-600' : 'border-slate-200 hover:border-slate-300',
                  ].join(' ')}
                >
                  <img src={src} alt="" className="w-full h-full object-contain p-1.5" />
                </button>
              ))}
            </div>
          )}
        </div>

        {/* --------------------------------------------------------- buy box */}
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <Badge tone="blue">{product.brand}</Badge>
              <Badge>{product.category}</Badge>
              {product.featured && <Badge tone="amber">Featured</Badge>}
            </div>

            <h1 className="text-[34px] lg:text-[44px] leading-[1.06] font-bold tracking-[-0.03em] text-slate-900">
              {product.title}
            </h1>

            <Rating value={product.rating} count={product.numReviews} size="md" />
          </div>

          <div className="flex items-end gap-3 flex-wrap">
            <span className="text-[28px] font-semibold tabular-nums text-slate-900">
              {product.priceLabel ?? formatINR(product.price)}
            </span>
            {discount && (
              <>
                <span className="text-base text-slate-400 line-through">
                  {product.originalPriceLabel ?? formatINR(product.originalPrice)}
                </span>
                <Badge tone="green">Save {discount}%</Badge>
              </>
            )}
          </div>

          {/* Wrapped: as a direct child of the flex-col it would stretch to
              the full column width. */}
          <div className="flex">
            <StockBadge stock={product.stock} />
          </div>

          <p className="text-sm text-slate-600 leading-relaxed">{product.description}</p>

          <div className="flex flex-col sm:flex-row gap-3 sm:items-center">
            <QuantityStepper
              value={quantity}
              onChange={setQuantity}
              max={Math.min(20, Math.max(1, product.stock))}
            />

            <Button size="lg" onClick={handleAdd} disabled={outOfStock} className="flex-1">
              {outOfStock ? 'Out of stock' : `Add ${quantity} to cart`}
            </Button>

            <Button
              variant="secondary"
              size="lg"
              onClick={() => toggle(product._id)}
              aria-pressed={saved}
            >
              {saved ? '♥ Saved' : '♡ Save'}
            </Button>
          </div>

          {!outOfStock && (
            <p className="text-xs text-slate-500">
              Subtotal for {quantity}: <strong className="text-slate-900">{formatINR(product.price * quantity)}</strong>
            </p>
          )}

          {specs.length > 0 && (
            <Card className="overflow-hidden mt-2">
              <h2 className="px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 bg-slate-50 border-b border-slate-200">
                Specifications
              </h2>
              <dl className="divide-y divide-slate-100">
                {specs.map(([key, value]) => (
                  <div key={key} className="flex gap-4 px-4 py-2.5">
                    <dt className="w-2/5 text-xs font-medium text-slate-500">{key}</dt>
                    <dd className="flex-1 text-xs text-slate-900">{String(value)}</dd>
                  </div>
                ))}
              </dl>
            </Card>
          )}
        </div>
      </div>

      {/* ------------------------------------------------------- related */}
      {related.length > 0 && (
        <section className="flex flex-col gap-4">
          <div className="flex items-baseline justify-between">
            <h2 className="text-lg font-bold tracking-tight text-slate-900">
              More in {product.category}
            </h2>
            <Link
              to={`/products?category=${product.category}`}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              View all
            </Link>
          </div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {related.slice(0, 4).map((item) => (
              <ProductCard key={item._id} product={item} />
            ))}
          </div>
        </section>
      )}
    </div>
  );
};

function DetailSkeleton() {
  return (
    <div className="grid lg:grid-cols-2 gap-8 lg:gap-12">
      <Skeleton className="aspect-square rounded-xl" />
      <div className="flex flex-col gap-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-9 w-4/5" />
        <Skeleton className="h-4 w-32" />
        <Skeleton className="h-10 w-40" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-12 w-full" />
      </div>
    </div>
  );
}

export default ProductDetails;
