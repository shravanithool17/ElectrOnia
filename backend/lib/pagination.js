// lib/pagination.js — one pagination contract for every list endpoint.

const DEFAULT_LIMIT = 12;
const MAX_LIMIT = 60;

export function parsePageParams(query = {}) {
  const page = Math.max(1, Number(query.page) || 1);
  const limit = Math.min(MAX_LIMIT, Math.max(1, Number(query.limit) || DEFAULT_LIMIT));
  return { page, limit, skip: (page - 1) * limit };
}

/**
 * Every list response has this shape. Clients can rely on `items` existing,
 * which is what let the frontend's toList() helper accept either form during
 * the migration.
 */
export function paginated(items, { page, limit, total }) {
  return {
    items,
    page,
    limit,
    total,
    totalPages: Math.max(1, Math.ceil(total / limit)),
    hasMore: page * limit < total,
  };
}
