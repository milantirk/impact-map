import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import fastifyStatic from '@fastify/static';
import type { FastifyInstance, FastifyRequest } from 'fastify';

export const CACHE_IMMUTABLE = 'public, max-age=31536000, immutable';
export const CACHE_REVALIDATE = 'no-cache';
export const CACHE_NONE = 'no-store';

/** Path of a request URL, without the query string. */
export function pathOf(url: string): string {
  const end = url.indexOf('?');
  return end === -1 ? url : url.slice(0, end);
}

export function isApiPath(pathname: string): boolean {
  return pathname === '/api' || pathname.startsWith('/api/');
}

/** API and health responses are never cached. */
export function isNoStorePath(pathname: string): boolean {
  return isApiPath(pathname) || pathname === '/healthz' || pathname === '/readyz';
}

function isDirectory(dir: string): boolean {
  try {
    return statSync(dir).isDirectory();
  } catch {
    return false;
  }
}

/**
 * A browser navigation to a client-side route: GET/HEAD, outside /api, last path segment
 * without a file extension, and HTML accepted.
 */
export function wantsSpaFallback(request: FastifyRequest): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false;
  const pathname = pathOf(request.url);
  if (isApiPath(pathname)) return false;
  if (pathname.slice(pathname.lastIndexOf('/') + 1).includes('.')) return false;
  return (request.headers.accept ?? '').includes('text/html');
}

export type StaticMode = 'spa' | 'files' | 'off';

/**
 * Serves the built web app from `root`. Files are listed once at start (no wildcard route), so
 * unknown paths never touch the file system. Hashed files in /assets are immutable; all other
 * files (index.html first) must be revalidated.
 */
export function registerStatic(app: FastifyInstance, root: string): StaticMode {
  if (!isDirectory(root)) {
    app.log.warn({ staticDir: root }, 'STATIC_DIR does not exist: serving the API only');
    return 'off';
  }
  const assetsDir = path.join(root, 'assets') + path.sep;
  app.register(fastifyStatic, {
    root,
    wildcard: false,
    index: ['index.html'],
    cacheControl: false,
    setHeaders: (reply, filePath) => {
      reply.header(
        'cache-control',
        filePath.startsWith(assetsDir) ? CACHE_IMMUTABLE : CACHE_REVALIDATE,
      );
    },
  });
  if (!existsSync(path.join(root, 'index.html'))) {
    app.log.warn({ staticDir: root }, 'STATIC_DIR has no index.html: no SPA fallback');
    return 'files';
  }
  return 'spa';
}
