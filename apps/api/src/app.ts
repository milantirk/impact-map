import { randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import fastifyHelmet, { type FastifyHelmetOptions } from '@fastify/helmet';
import Fastify, { type FastifyInstance } from 'fastify';
import type { Config } from './config';
import { BODY_LIMIT_BYTES, errorHandler, type ErrorBody } from './errors';
import { apiRoutes } from './routes/api';
import { healthRoutes } from './routes/health';
import { CACHE_NONE, isNoStorePath, pathOf, registerStatic, wantsSpaFallback } from './static';
import type { DecisionStore } from './store/types';

export interface AppDeps {
  config: Config;
  store: DecisionStore;
  /** where JSON log lines go (default: stdout); tests capture them here */
  logStream?: { write(line: string): void };
}

export const SECURITY_HEADERS: FastifyHelmetOptions = {
  contentSecurityPolicy: {
    useDefaults: false,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'"],
      'style-src': ["'self'", "'unsafe-inline'"],
      'img-src': ["'self'", 'data:'],
      'font-src': ["'self'"],
      'connect-src': ["'self'"],
      'object-src': ["'none'"],
      'base-uri': ["'self'"],
      'frame-ancestors': ["'none'"],
      'form-action': ["'self'"],
    },
  },
  strictTransportSecurity: { maxAge: 31_536_000, includeSubDomains: true },
  referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin' },
  xFrameOptions: { action: 'deny' },
};

const REDACTED_PATHS = [
  'req.headers.authorization',
  'req.headers.cookie',
  'headers.authorization',
  'headers.cookie',
  'res.headers["set-cookie"]',
];

const REQUEST_ID = /^[\w.:/+=-]{1,200}$/;

/** X-Request-ID, else X-Azure-Ref (Azure Front Door), else a random UUID. */
export function requestIdFrom(req: IncomingMessage): string {
  for (const name of ['x-request-id', 'x-azure-ref']) {
    const header = req.headers[name];
    const value = Array.isArray(header) ? header[0] : header;
    if (value !== undefined && REQUEST_ID.test(value)) return value;
  }
  return randomUUID();
}

const NOT_FOUND: ErrorBody = { error: 'not_found', message: 'Not found.' };

/** The HTTP app: health checks, the JSON API under /api and the web app from STATIC_DIR. */
export function buildApp({ config, store, logStream }: AppDeps): FastifyInstance {
  const app = Fastify({
    logger: {
      level: config.logLevel,
      redact: { paths: REDACTED_PATHS, censor: '[redacted]' },
      ...(logStream ? { stream: logStream } : {}),
    },
    bodyLimit: BODY_LIMIT_BYTES,
    trustProxy: config.trustProxy,
    requestIdHeader: false,
    genReqId: requestIdFrom,
  });

  // JSON only: a text/plain body (e.g. fetch without a Content-Type) gets 415.
  app.removeContentTypeParser('text/plain');

  app.addHook('onRequest', async (request, reply) => {
    reply.header('x-request-id', request.id);
    if (isNoStorePath(pathOf(request.url))) reply.header('cache-control', CACHE_NONE);
  });

  app.register(fastifyHelmet, SECURITY_HEADERS);
  app.setErrorHandler(errorHandler);

  app.register(healthRoutes(store, config.logLevel));
  app.register(apiRoutes({ store, rateLimitMax: config.rateLimitMax }), { prefix: '/api' });
  const staticMode = registerStatic(app, config.staticDir);

  // Unknown paths outside /api: client-side routes get index.html, everything else JSON 404.
  app.setNotFoundHandler(async (request, reply) => {
    if (staticMode === 'spa' && wantsSpaFallback(request)) {
      return reply.code(200).sendFile('index.html');
    }
    return reply.code(404).header('cache-control', CACHE_NONE).send(NOT_FOUND);
  });

  return app;
}
