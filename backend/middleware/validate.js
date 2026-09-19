// middleware/validate.js — zod at the edge.
//
// Parsed values are written back onto the request, so controllers receive
// coerced, trimmed, known-shaped data and unknown keys are dropped. That
// removes a whole class of mass-assignment bug.
import { ValidationError } from '../lib/errors.js';

/**
 * validate({ body, query, params }) — each optional, each a zod schema.
 */
export function validate(schemas) {
  return (req, res, next) => {
    for (const source of ['params', 'query', 'body']) {
      const schema = schemas[source];
      if (!schema) continue;

      const result = schema.safeParse(req[source]);

      if (!result.success) {
        const details = result.error.issues.map((issue) => ({
          field: issue.path.join('.') || source,
          message: issue.message,
        }));
        return next(new ValidationError('Some fields need attention', details));
      }

      if (source === 'query') {
        // Getter-only in Express 5 — mutate rather than reassign.
        for (const key of Object.keys(req.query)) delete req.query[key];
        Object.assign(req.query, result.data);
      } else {
        req[source] = result.data;
      }
    }
    return next();
  };
}
