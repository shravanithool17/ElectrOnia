import { Router } from 'express';
import { dbState } from '../../config/db.js';

export const healthRoutes = Router();

/** Liveness: the process is up. Never touches a dependency. */
healthRoutes.get('/health', (req, res) => {
  res.json({ status: 'ok', uptimeSeconds: Math.round(process.uptime()) });
});

/**
 * Readiness: this instance can serve traffic. Conflating the two makes a
 * deploy route requests to an instance with no database.
 */
healthRoutes.get('/ready', (req, res) => {
  const db = dbState();
  const ready = db === 'connected';
  res.status(ready ? 200 : 503).json({ status: ready ? 'ready' : 'not-ready', db });
});
