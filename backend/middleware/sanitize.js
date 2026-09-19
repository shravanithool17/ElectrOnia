// middleware/sanitize.js — strips MongoDB operator keys from input.
//
// Why hand-written instead of express-mongo-sanitize: that package assigns to
// req.query, which in Express 5 is a getter-only property, so it throws on
// boot. This mutates the existing objects in place instead.
//
// The real defence against operator injection is never passing user input
// straight into a query — every route here builds its filter explicitly and
// validates with zod. This is defence in depth.

const FORBIDDEN_KEY = /^\$|\./;

function scrub(value, depth = 0) {
  if (depth > 10 || value === null || typeof value !== 'object') return;

  if (Array.isArray(value)) {
    value.forEach((item) => scrub(item, depth + 1));
    return;
  }

  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEY.test(key)) {
      delete value[key];
      continue;
    }
    scrub(value[key], depth + 1);
  }
}

export function sanitize(req, res, next) {
  scrub(req.body);
  scrub(req.params);
  // req.query is a getter in Express 5 — mutate the returned object, never
  // reassign the property.
  if (req.query && typeof req.query === 'object') scrub(req.query);
  next();
}
