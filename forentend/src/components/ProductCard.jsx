import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { useCart } from '../context/CartContext';
import { useWishlist } from '../hooks/useWishlist';
import { formatINR, discountPercent } from '../lib/money';
import { primaryImage, IMAGE_PLACEHOLDER } from '../lib/images';
import { Rating } from './ui';
import { useAddedPop } from './motion';
import { colorFor } from '../lib/palette';

// Showroom card: the product large on a soft grey tile, a quiet kicker line
// ("New", "Save 12%", "Only 3 left") in orange, the name and price below.
// Hover lifts the tile and slowly scales the product — smooth, not bouncy.
const ProductCard = ({ product }) => {
  const { addToCart } = useCart();
  const { has, toggle } = useWishlist();
  const [imageFailed, setImageFailed] = useState(false);
  const [popped, showPop] = useAddedPop();

  // Prices arrive as integer paise; discountPercent returns null when there is
  // no discount worth showing.
  const discount = discountPercent(product.originalPrice, product.price);
  const outOfStock = product.stock <= 0;
  const lowStock = !outOfStock && product.stock <= 5;
  const saved = has(product._id);
  const imageUrl = imageFailed ? IMAGE_PLACEHOLDER : primaryImage(product);

  // One kicker, most important first.
  const kicker = outOfStock
    ? null
    : lowStock
      ? `Only ${product.stock} left`
      : discount
        ? `Save ${discount}%`
        : product.featured
          ? 'Featured'
          : null;

  // The pop only shows once the server has accepted it — the cart toast
  // already reports a failure.
  const onAdd = async () => {
    try {
      await addToCart(product, 1);
      showPop();
    } catch {
      /* reported by the cart */
    }
  };

  return (
    <div className="group relative flex flex-col rounded-3xl bg-slate-50 transition-all duration-500 ease-[cubic-bezier(.22,1,.36,1)] hover:-translate-y-1 hover:bg-white hover:shadow-[0_18px_50px_-12px_rgba(0,0,0,0.18)]">
      <div className="relative aspect-square overflow-hidden rounded-t-3xl">
        <Link
          to={`/products/${product._id}`}
          className="glow-behind block w-full h-full"
          style={{ '--glow': colorFor(product.category).glow }}
          tabIndex={-1}
          aria-hidden="true"
        >
          <img
            src={imageUrl}
            alt=""
            loading="lazy"
            onError={() => setImageFailed(true)}
            className="relative product-shadow w-full h-full object-contain p-6 transition-transform duration-700 ease-[cubic-bezier(.22,1,.36,1)] group-hover:scale-[1.06]"
          />
        </Link>

        <button
          type="button"
          onClick={() => toggle(product._id)}
          aria-label={saved ? `Remove ${product.title} from wishlist` : `Save ${product.title}`}
          aria-pressed={saved}
          className={`absolute top-3 right-3 z-10 w-9 h-9 rounded-full flex items-center justify-center transition-all duration-300 ${
            saved ? 'bg-white text-signal-500 opacity-100' : 'bg-white/90 text-slate-500 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 hover:text-slate-900'
          } shadow-sm`}
        >
          <svg viewBox="0 0 24 24" className="w-4 h-4" fill={saved ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2" aria-hidden="true">
            <path d="M20.8 4.6a5.5 5.5 0 00-7.8 0L12 5.7l-1-1.1a5.5 5.5 0 00-7.8 7.8l8.8 8.8 8.8-8.8a5.5 5.5 0 000-7.8z" />
          </svg>
        </button>

        {outOfStock && (
          <div className="absolute inset-0 bg-white/60 backdrop-blur-[2px] flex items-center justify-center">
            <span className="rounded-full bg-slate-900/85 text-white text-[12px] font-medium px-3 py-1">Sold out</span>
          </div>
        )}

        {popped}
      </div>

      <div className="px-5 pb-5 pt-1 flex flex-col gap-1 flex-1">
        <span className={`text-[12px] font-semibold min-h-[1.1em] ${lowStock ? 'text-signal-600' : colorFor(product.category).text}`}>{kicker}</span>

        <Link
          to={`/products/${product._id}`}
          className="text-[17px] font-semibold text-slate-900 leading-snug tracking-[-0.02em] line-clamp-2 hover:text-blue-600 transition-colors"
        >
          {product.title}
        </Link>

        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="text-[12px] text-slate-500">{product.brand}</span>
          <Rating value={product.rating} count={product.numReviews} />
        </div>

        <div className="flex flex-wrap items-end justify-between gap-x-3 gap-y-2 mt-auto pt-4">
          <div className="flex flex-col leading-tight">
            <span className="text-[15px] font-medium text-slate-900 tabular-nums">
              {product.priceLabel ?? formatINR(product.price)}
            </span>
            {discount && (
              <span className="text-[12px] text-slate-400 line-through tabular-nums">
                {product.originalPriceLabel ?? formatINR(product.originalPrice)}
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onAdd}
            disabled={outOfStock}
            aria-label={`Add ${product.title} to bag`}
            className="shrink-0 rounded-full bg-blue-600 text-white text-[13px] font-medium px-4 py-1.5 transition-all duration-300 hover:bg-blue-700 disabled:bg-slate-200 disabled:text-slate-400 active:scale-95"
          >
            Add to Bag
          </button>
        </div>
      </div>
    </div>
  );
};

export default ProductCard;
