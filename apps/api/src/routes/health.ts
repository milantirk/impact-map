import { MODEL_VERSION } from '@impact-map/engine';
import type { FastifyPluginAsync } from 'fastify';
import type { LogLevel } from '../config';
import type { DecisionStore } from '../store/types';

const READY_TIMEOUT_MS = 3000;

export async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/** Liveness (process is up) and readiness (the store answers). Not rate limited. */
export function healthRoutes(store: DecisionStore, logLevel: LogLevel): FastifyPluginAsync {
  return async (app) => {
    // Probes call these every few seconds: at the default level, log only problems.
    const options = { logLevel: logLevel === 'info' ? 'warn' : logLevel };

    app.get('/healthz', options, async () => ({ status: 'ok', version: MODEL_VERSION }));

    app.get('/readyz', options, async (request, reply) => {
      try {
        await withTimeout(store.ping(), READY_TIMEOUT_MS);
        return { status: 'ready' };
      } catch (err) {
        request.log.warn({ err }, 'readiness check failed');
        return reply.code(503).send({ status: 'unavailable' });
      }
    });
  };
}
