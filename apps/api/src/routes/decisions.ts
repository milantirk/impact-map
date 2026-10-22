import { cleanFactors, knowledge, MODEL_VERSION } from '@impact-map/engine';
import type { FastifyPluginAsync } from 'fastify';
import { badRequest, notFound } from '../errors';
import { DecisionBodySchema } from '../schemas';
import { isDecisionId } from '../store/id';
import type { DecisionStore } from '../store/types';

/** Saves per client per minute. This route has its own bucket, apart from RATE_LIMIT_MAX. */
export const DECISIONS_RATE_LIMIT = 20;

/** Shareable, immutable decision models. Public: no authentication yet. */
export function decisionRoutes(store: DecisionStore): FastifyPluginAsync {
  return async (app) => {
    app.post(
      '/decisions',
      { config: { rateLimit: { max: DECISIONS_RATE_LIMIT, timeWindow: '1 minute' } } },
      async (request, reply) => {
        const body = DecisionBodySchema.parse(request.body);
        const factors = body.factors ? cleanFactors(body.factors, knowledge) : null;
        const saved = await store.save({
          text: body.text,
          factors,
          settings: body.settings,
          modelVersion: MODEL_VERSION,
        });
        return reply
          .code(201)
          .header('location', `${request.routeOptions.url}/${saved.id}`)
          .send({ id: saved.id, createdAt: saved.createdAt });
      },
    );

    app.get<{ Params: { id: string } }>('/decisions/:id', async (request) => {
      const { id } = request.params;
      if (!isDecisionId(id)) {
        throw badRequest('Invalid decision id: expected 10 URL-safe characters.');
      }
      const decision = await store.get(id);
      if (!decision) throw notFound('Decision not found.');
      return decision;
    });
  };
}
