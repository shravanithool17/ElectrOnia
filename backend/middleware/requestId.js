// middleware/requestId.js
//
// One id per request, propagated if the caller supplied it. Every log line
// carries it, so a failure in a queue job can be traced back to the request
// that enqueued it.
import { randomUUID } from 'crypto';

export function requestId(req, res, next) {
  const incoming = req.get('X-Request-Id');
  req.id = incoming && incoming.length <= 128 ? incoming : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  next();
}
