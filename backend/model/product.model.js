import mongoose from 'mongoose';

const productSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      required: true,
    },
    // Money is an integer number of paise — ₹2,499.00 is 249900.
    // See docs/adr/0003-money-as-integer-paise.md
    price: {
      type: Number,
      required: true,
      min: 0,
      validate: { validator: Number.isInteger, message: 'price must be integer paise' },
    },
    originalPrice: {
      type: Number,
      min: 0,
      validate: {
        validator: (v) => v == null || Number.isInteger(v),
        message: 'originalPrice must be integer paise',
      },
    },
    category: {
      type: String,
      required: true,
      enum: ['Laptops', 'Smartphones', 'Audio', 'Wearables', 'Gaming', 'Accessories'],
    },
    brand: {
      type: String,
      required: true,
    },
    stock: {
      type: Number,
      required: true,
      default: 10,
      min: 0,
    },
    rating: {
      type: Number,
      default: 4.5,
      min: 0,
      max: 5,
    },
    numReviews: {
      type: Number,
      default: 12,
      min: 0,
    },
    images: [
      {
        type: String,
      },
    ],
    specifications: {
      type: Map,
      of: String,
    },
    companyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Company',
      index: true,
    },
    featured: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// ---------------------------------------------------------------------------
// Indexes
//
// The catalogue is filtered by category and brand and sorted by price or
// createdAt. A compound index in that order lets one index serve the filter
// and the sort together, so Mongo neither scans the collection nor sorts in
// memory. Verify with:
//
//   db.products.find({ category: 'Laptops' }).sort({ price: 1 })
//     .explain('executionStats')
//
// and compare executionTimeMillis / totalDocsExamined before and after.
// ---------------------------------------------------------------------------
productSchema.index({ category: 1, brand: 1, price: 1 });
productSchema.index({ featured: 1, createdAt: -1 });
productSchema.index({ price: 1 });

// Text index for search. Weighted so a title match outranks a description
// match. This replaces the previous $regex search, which could not use an
// index at all and scanned every document on every keystroke.
productSchema.index(
  { title: 'text', brand: 'text', description: 'text' },
  { weights: { title: 10, brand: 5, description: 1 }, name: 'product_search' }
);

const Product = mongoose.model('Product', productSchema);
export default Product;
