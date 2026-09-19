import React, { useEffect, useState } from 'react';
import { Button } from '../ui';
import { toPaise, toRupees } from '../../lib/money';

const CATEGORIES = ['Laptops', 'Smartphones', 'Audio', 'Wearables', 'Gaming', 'Accessories'];

const BLANK = {
  title: '',
  description: '',
  price: '',
  originalPrice: '',
  category: 'Laptops',
  brand: '',
  stock: '10',
  imageUrl: '',
  featured: false,
};

/**
 * One form for both create and edit. `product` null means create; passing a
 * product prefills and switches to PATCH, which sends only what changed.
 */
export default function ProductFormModal({ open, product, onClose, onSubmit }) {
  const [form, setForm] = useState(BLANK);
  const [errors, setErrors] = useState([]);
  const [saving, setSaving] = useState(false);

  const isEdit = Boolean(product);

  useEffect(() => {
    if (!open) return;
    setErrors([]);
    setForm(
      product
        ? {
            title: product.title ?? '',
            description: product.description ?? '',
            // Money is paise on the wire and rupees in the form, because that
            // is what a person types.
            price: String(toRupees(product.price)),
            originalPrice: product.originalPrice ? String(toRupees(product.originalPrice)) : '',
            category: product.category ?? 'Laptops',
            brand: product.brand ?? '',
            stock: String(product.stock ?? 0),
            imageUrl: product.images?.[0] ?? '',
            featured: Boolean(product.featured),
          }
        : BLANK
    );
  }, [open, product]);

  // Escape closes, and the page behind does not scroll while the modal is up.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const change = (event) => {
    const { name, value, type, checked } = event.target;
    setForm((f) => ({ ...f, [name]: type === 'checkbox' ? checked : value }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setErrors([]);
    setSaving(true);

    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      brand: form.brand,
      stock: Number(form.stock) || 0,
      featured: form.featured,
      price: toPaise(form.price),
      ...(form.originalPrice ? { originalPrice: toPaise(form.originalPrice) } : {}),
      ...(form.imageUrl ? { images: [form.imageUrl] } : {}),
    };

    try {
      await onSubmit(payload, isEdit ? product._id : null);
      onClose();
    } catch (err) {
      // The API returns field-level detail; show it next to the form rather
      // than a single opaque "failed".
      setErrors(err.details?.length ? err.details : [{ field: '', message: err.message }]);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/30 backdrop-blur-md flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={isEdit ? 'Edit product' : 'Add product'}
    >
      <div className="bg-white rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b border-slate-200 px-5 py-3.5 flex items-center justify-between">
          <h2 className="text-base font-bold text-slate-900">
            {isEdit ? 'Edit product' : 'Add a product'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-slate-400 hover:text-slate-700 text-xl leading-none px-1"
          >
            ×
          </button>
        </div>

        <form onSubmit={submit} className="p-5 flex flex-col gap-3.5">
          {errors.length > 0 && (
            <div className="bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex flex-col gap-0.5">
              {errors.map((error, i) => (
                <p key={i} className="text-xs text-red-700">
                  {error.field && <strong className="capitalize">{error.field}: </strong>}
                  {error.message}
                </p>
              ))}
            </div>
          )}

          <Field label="Title" required>
            <input name="title" value={form.title} onChange={change} required className={INPUT} />
          </Field>

          <Field label="Description" required hint="At least 10 characters">
            <textarea
              name="description"
              value={form.description}
              onChange={change}
              rows={3}
              required
              className={INPUT}
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Price (₹)" required>
              <input
                name="price"
                type="number"
                min="0"
                step="0.01"
                value={form.price}
                onChange={change}
                required
                className={INPUT}
              />
            </Field>
            <Field label="Original price (₹)" hint="Shown struck through">
              <input
                name="originalPrice"
                type="number"
                min="0"
                step="0.01"
                value={form.originalPrice}
                onChange={change}
                className={INPUT}
              />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Category" required>
              <select name="category" value={form.category} onChange={change} className={INPUT}>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </Field>
            <Field label="Brand" required>
              <input name="brand" value={form.brand} onChange={change} required className={INPUT} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Stock">
              <input
                name="stock"
                type="number"
                min="0"
                value={form.stock}
                onChange={change}
                className={INPUT}
              />
            </Field>
            <Field label="Image URL">
              <input
                name="imageUrl"
                type="url"
                value={form.imageUrl}
                onChange={change}
                placeholder="https://…"
                className={INPUT}
              />
            </Field>
          </div>

          <label className="flex items-center gap-2 text-sm text-slate-700 cursor-pointer">
            <input
              name="featured"
              type="checkbox"
              checked={form.featured}
              onChange={change}
              className="w-4 h-4 accent-blue-600"
            />
            Show on the homepage
          </label>

          <div className="flex gap-2 pt-1">
            <Button type="submit" loading={saving} full>
              {isEdit ? 'Save changes' : 'Add product'}
            </Button>
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}

const INPUT =
  'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500';

function Field({ label, hint, required, children }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-xs font-semibold text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
      {hint && <span className="text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}
