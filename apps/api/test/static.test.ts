import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { FIXTURES, MISSING_DIR, PUBLIC_DIR, testApp } from './helpers';

const HTML = { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' };

describe('web app from STATIC_DIR', () => {
  const app = () => testApp({ env: { STATIC_DIR: PUBLIC_DIR } });

  it('serves index.html at / for revalidation', async () => {
    const res = await app().inject({ url: '/', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/html');
    expect(res.headers['cache-control']).toBe('no-cache');
    expect(res.body).toContain('spa-fixture');
  });

  it('serves /index.html with no-cache', async () => {
    const res = await app().inject({ url: '/index.html' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-cache');
  });

  it('serves hashed assets as immutable', async () => {
    const res = await app().inject({ url: '/assets/x.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    expect(res.headers.etag).toBeDefined();
    expect(res.body).toContain('asset-fixture');
  });

  it('answers a conditional request with 304', async () => {
    const instance = app();
    const first = await instance.inject({ url: '/assets/x.js' });
    const etag = String(first.headers.etag);
    const second = await instance.inject({
      url: '/assets/x.js',
      headers: { 'if-none-match': etag },
    });
    expect(second.statusCode).toBe(304);
  });

  it.each(['/d/AbCdEfGhIj', '/settings', '/a/b/c?x=1'])(
    'falls back to index.html for the client route %s',
    async (url) => {
      const res = await app().inject({ url, headers: HTML });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toContain('spa-fixture');
    },
  );

  it.each([
    ['a client that does not accept HTML', '/settings', {}],
    ['a missing file', '/assets/missing.js', HTML],
    ['a missing file at the root', '/robots.txt', HTML],
    ['an unknown API path', '/api/v1/missing', HTML],
  ])('returns a JSON 404 for %s', async (_name, url, headers) => {
    const res = await app().inject({ url, headers });
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Not found.' });
  });

  it('does not fall back for other methods', async () => {
    const res = await app().inject({
      method: 'POST',
      url: '/settings',
      headers: { ...HTML, 'content-type': 'application/json' },
      payload: '{}',
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe('not_found');
  });

  it('does not serve files outside STATIC_DIR', async () => {
    for (const url of ['/../helpers.ts', '/assets/../../helpers.ts', '/%2e%2e/helpers.ts']) {
      const res = await app().inject({ url });
      expect(res.statusCode).toBe(404);
      expect(res.body).not.toContain('testConfig');
    }
  });

  it('keeps the API working next to the web app', async () => {
    const res = await app().inject({ url: '/api/v1/meta', headers: HTML });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
  });
});

describe('without a web app', () => {
  it('serves the API only when STATIC_DIR does not exist', async () => {
    const instance = testApp({ env: { STATIC_DIR: MISSING_DIR } });
    expect((await instance.inject({ url: '/', headers: HTML })).statusCode).toBe(404);
    expect((await instance.inject({ url: '/healthz' })).statusCode).toBe(200);
    expect((await instance.inject({ url: '/api/v1/meta' })).statusCode).toBe(200);
  });

  it('serves files but no fallback when index.html is missing', async () => {
    const instance = testApp({ env: { STATIC_DIR: path.join(FIXTURES, 'public', 'assets') } });
    expect((await instance.inject({ url: '/x.js' })).statusCode).toBe(200);
    expect((await instance.inject({ url: '/settings', headers: HTML })).statusCode).toBe(404);
  });
});
