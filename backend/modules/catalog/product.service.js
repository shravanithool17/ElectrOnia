// modules/catalog/product.service.js
import { NotFoundError } from '../../lib/errors.js';
import { parsePageParams, paginated } from '../../lib/pagination.js';
import { productRepo } from './product.repo.js';
import { toProductDto, toProductDtos } from './product.dto.js';

const SORTS = {
  price_asc: { price: 1 },
  price_desc: { price: -1 },
  rating: { rating: -1 },
  newest: { createdAt: -1 },
};

function buildFilter({ search, category, brand, minPrice, maxPrice, featured }) {
  const filter = {};

  // Uses the weighted text index rather than a regex scan of every document.
  if (search) filter.$text = { $search: search };
  if (category && category !== 'All') filter.category = category;
  if (brand && brand !== 'All') filter.brand = brand;
  if (featured === 'true') filter.featured = true;

  if (minPrice != null || maxPrice != null) {
    filter.price = {};
    if (minPrice != null) filter.price.$gte = minPrice;
    if (maxPrice != null) filter.price.$lte = maxPrice;
  }

  return filter;
}

export const productService = {
  async list(query) {
    const { page, limit, skip } = parsePageParams(query);
    const filter = buildFilter(query);
    const sort = SORTS[query.sort] ?? SORTS.newest;

    const [products, total] = await productRepo.findPage(filter, { sort, skip, limit });
    return paginated(toProductDtos(products), { page, limit, total });
  },

  /** Powers the filter sidebar: available brands, categories and price bounds. */
  async facets(query) {
    const [result] = await productRepo.facets(buildFilter(query));

    return {
      brands: result.brands.map((b) => ({ value: b._id, count: b.count })).filter((b) => b.value),
      categories: result.categories.map((c) => ({ value: c._id, count: c.count })),
      priceRange: {
        min: result.price[0]?.min ?? 0,
        max: result.price[0]?.max ?? 0,
      },
      total: result.total[0]?.value ?? 0,
    };
  },

  async getRelated(id, limit = 4) {
    const product = await productRepo.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    const related = await productRepo.findRelated(product, limit);
    return { items: toProductDtos(related), total: related.length };
  },

  async getById(id) {
    const product = await productRepo.findById(id);
    if (!product) throw new NotFoundError('Product not found');
    return toProductDto(product);
  },

  async listForVendor(vendorId) {
    const products = await productRepo.findByVendor(vendorId);
    return { items: toProductDtos(products), total: products.length };
  },

  async create(vendorId, input) {
    const product = await productRepo.create({
      ...input,
      // originalPrice defaults to 20% above price, matching the storefront's
      // "was / now" presentation.
      originalPrice: input.originalPrice ?? Math.round(input.price * 1.2),
      stock: input.stock ?? 10,
      images: input.images?.length
        ? input.images
        : ['https://images.unsplash.com/photo-1526738549149-8e07eca6c147?auto=format&fit=crop&w=800&q=80'],
      specifications: input.specifications ?? {},
      // Ownership comes from the verified token, never from the request body.
      companyId: vendorId,
      featured: Boolean(input.featured),
    });

    return toProductDto(product.toObject());
  },

  async update(id, vendorId, updates) {
    const product = await productRepo.updateOwned(id, vendorId, updates);
    if (!product) throw new NotFoundError('Product not found among your listings');
    return toProductDto(product.toObject());
  },

  async remove(id, vendorId) {
    const product = await productRepo.deleteOwned(id, vendorId);
    if (!product) throw new NotFoundError('Product not found among your listings');
  },
};
