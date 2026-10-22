import { analyze, catalog, interpret, type Catalog, type Lang } from '@impact-map/engine';
import type { FastifyPluginAsync } from 'fastify';
import { AnalyzeBodySchema, InterpretBodySchema, MetaQuerySchema } from '../schemas';

/** Knowledge catalog, text interpretation and the full analysis. Stateless. */
export const analysisRoutes: FastifyPluginAsync = async (app) => {
  // The knowledge base is static, so each language is built once.
  const catalogs = new Map<Lang, Catalog>();

  app.get('/meta', async (request) => {
    const { lang = 'hu' } = MetaQuerySchema.parse(request.query);
    let value = catalogs.get(lang);
    if (!value) {
      value = catalog(lang);
      catalogs.set(lang, value);
    }
    return value;
  });

  app.post('/interpret', async (request) => {
    const { text, lang = 'hu' } = InterpretBodySchema.parse(request.body);
    return interpret(text, lang);
  });

  app.post('/analyze', async (request) => analyze(AnalyzeBodySchema.parse(request.body)));
};
