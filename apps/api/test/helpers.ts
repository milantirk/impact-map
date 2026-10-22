import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { FastifyInstance } from 'fastify';
import { afterEach } from 'vitest';
import { buildApp } from '../src/app';
import { loadConfig, type Config } from '../src/config';
import { MemoryStore } from '../src/store/memory';
import type { DecisionStore } from '../src/store/types';

export const FIXTURES = fileURLToPath(new URL('./fixtures/', import.meta.url));
/** A built web app: index.html and assets/x.js. */
export const PUBLIC_DIR = path.join(FIXTURES, 'public');
export const MISSING_DIR = path.join(FIXTURES, 'does-not-exist');

export function testConfig(env: Record<string, string> = {}): Config {
  return loadConfig({ LOG_LEVEL: 'silent', STATIC_DIR: MISSING_DIR, ...env });
}

const open: FastifyInstance[] = [];

afterEach(async () => {
  await Promise.all(open.splice(0).map((app) => app.close()));
});

/** An app on an in-memory store (unless given), closed after each test. */
export function testApp(options: { env?: Record<string, string>; store?: DecisionStore } = {}) {
  const app = buildApp({
    config: testConfig(options.env),
    store: options.store ?? new MemoryStore(),
  });
  open.push(app);
  return app;
}

export const json = (payload: unknown) => ({
  headers: { 'content-type': 'application/json' },
  payload: JSON.stringify(payload),
});
