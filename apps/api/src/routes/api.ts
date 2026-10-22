import { isIP } from 'node:net';
import fastifyRateLimit, { normalizeIP } from '@fastify/rate-limit';
import type { FastifyPluginAsync, FastifyRequest } from 'fastify';
import { HttpError, notFound } from '../errors';
import type { DecisionStore } from '../store/types';
import { analysisRoutes } from './analysis';
import { decisionRoutes } from './decisions';

export interface ApiOptions {
  store: DecisionStore;
  /** requests per client per minute over all /api routes */
  rateLimitMax: number;
}

/** Azure Front Door puts the real client address in X-Azure-ClientIP. */
export function clientKey(request: FastifyRequest): string {
  const header = request.headers['x-azure-clientip'];
  const value = (Array.isArray(header) ? header[0] : header)?.trim();
  return normalizeIP(value && isIP(value) ? value : request.ip || 'unknown');
}

/** Everything under /api: rate limited, JSON only. Mount it with the prefix '/api'. */
export function apiRoutes({ store, rateLimitMax }: ApiOptions): FastifyPluginAsync {
  return async (api) => {
    // Registered inside this plugin, so the limit applies to the /api routes only.
    await api.register(fastifyRateLimit, {
      global: true,
      max: rateLimitMax,
      timeWindow: '1 minute',
      keyGenerator: clientKey,
      errorResponseBuilder: (_request, context) =>
        new HttpError(
          context.statusCode,
          'rate_limited',
          `Too many requests: retry in ${context.after}.`,
        ),
    });

    api.setNotFoundHandler({ preHandler: api.rateLimit() }, async () => {
      throw notFound();
    });

    await api.register(analysisRoutes, { prefix: '/v1' });
    await api.register(decisionRoutes(store), { prefix: '/v1' });
  };
}
