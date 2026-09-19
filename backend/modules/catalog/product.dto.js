// modules/catalog/product.dto.js — the shape the API promises.
//
// Money is returned as integer paise plus a preformatted label, so a client
// never has to know the convention to render a price, and never does money
// arithmetic on a float.
import { formatINR } from '../../lib/money.js';

export function toProductDto(product) {
  if (!product) return null;

  return {
    _id: product._id,
    title: product.title,
    description: product.description,
    category: product.category,
    brand: product.brand,
    stock: product.stock,
    rating: product.rating,
    numReviews: product.numReviews,
    images: product.images ?? [],
    specifications: product.specifications ?? {},
    featured: Boolean(product.featured),
    companyId: product.companyId,
    createdAt: product.createdAt,

    price: product.price,
    priceLabel: formatINR(product.price),
    originalPrice: product.originalPrice ?? null,
    originalPriceLabel:
      product.originalPrice != null ? formatINR(product.originalPrice) : null,
  };
}

export const toProductDtos = (products) => products.map(toProductDto);
