// lib/asyncHandler.js
//
// Express 5 forwards rejected promises to the error handler on its own, so this
// is strictly belt-and-braces. It is kept because it makes the intent explicit
// at every route and costs nothing.
export const asyncHandler = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);
