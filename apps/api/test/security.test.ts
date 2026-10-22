import { describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory';
import type { NewDecision, SavedDecision } from '../src/store/types';
import { json, PUBLIC_DIR, testApp } from './helpers';

const CSP =
  "default-src 'self';script-src 'self';style-src 'self' 'unsafe-inline';img-src 'self' data:;" +
  "font-src 'self';connect-src 'self';object-src 'none';base-uri 'self';frame-ancestors 'none';" +
  "form-action 'self'";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SETTINGS = { steps: 3, people: 1, windowDays: 365, durationDays: null, lang: 'hu' };

describe('security headers', () => {
  it.each(['/healthz', '/api/v1/meta', '/api/v1/unknown', '/', '/assets/x.js', '/a/client/route'])(
    'are set on %s',
    async (url) => {
      const res = await testApp({ env: { STATIC_DIR: PUBLIC_DIR } }).inject({
        url,
        headers: { accept: 'text/html' },
      });
      expect(res.headers['content-security-policy']).toBe(CSP);
      expect(res.headers['strict-transport-security']).toBe('max-age=31536000; includeSubDomains');
      expect(res.headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
      expect(res.headers['cross-origin-opener-policy']).toBe('same-origin');
      expect(res.headers['x-content-type-options']).toBe('nosniff');
      expect(res.headers['x-frame-options']).toBe('DENY');
      expect(res.headers['x-powered-by']).toBeUndefined();
    },
  );
});

describe('request id', () => {
  it('echoes X-Request-ID', async () => {
    const res = await testApp().inject({ url: '/healthz', headers: { 'x-request-id': 'req-123' } });
    expect(res.headers['x-request-id']).toBe('req-123');
  });

  it('falls back to X-Azure-Ref from Azure Front Door', async () => {
    const ref = '20261021T103000Z-1a2b3c4d5e6f+/=';
    const res = await testApp().inject({ url: '/healthz', headers: { 'x-azure-ref': ref } });
    expect(res.headers['x-request-id']).toBe(ref);
  });

  it('prefers X-Request-ID over X-Azure-Ref', async () => {
    const res = await testApp().inject({
      url: '/healthz',
      headers: { 'x-request-id': 'mine', 'x-azure-ref': 'theirs' },
    });
    expect(res.headers['x-request-id']).toBe('mine');
  });

  it('creates a random id when none (or an unsafe one) is given', async () => {
    const app = testApp();
    const plain = await app.inject({ url: '/api/v1/unknown' });
    expect(plain.headers['x-request-id']).toMatch(UUID);
    const unsafe = await app.inject({
      url: '/healthz',
      headers: { 'x-request-id': '<script>alert(1)</script>' },
    });
    expect(unsafe.headers['x-request-id']).toMatch(UUID);
    const long = await app.inject({
      url: '/healthz',
      headers: { 'x-request-id': 'a'.repeat(201) },
    });
    expect(long.headers['x-request-id']).toMatch(UUID);
  });
});

describe('rate limit', () => {
  it('limits /api to RATE_LIMIT_MAX requests per client and minute', async () => {
    const app = testApp({ env: { RATE_LIMIT_MAX: '3' } });
    for (let i = 0; i < 3; i++) {
      const res = await app.inject({ url: '/api/v1/meta' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBe('3');
    }
    const limited = await app.inject({ url: '/api/v1/meta' });
    expect(limited.statusCode).toBe(429);
    expect(limited.headers['retry-after']).toBeDefined();
    expect(limited.headers['cache-control']).toBe('no-store');
    expect(limited.json()).toEqual({
      error: 'rate_limited',
      message: expect.stringMatching(/^Too many requests: retry in /),
    });
    // Health checks stay available.
    expect((await app.inject({ url: '/healthz' })).statusCode).toBe(200);
  });

  it('shares one budget over all /api routes, unknown ones too', async () => {
    const app = testApp({ env: { RATE_LIMIT_MAX: '2' } });
    expect((await app.inject({ url: '/api/v1/nope' })).statusCode).toBe(404);
    expect((await app.inject({ url: '/api/v1/meta' })).statusCode).toBe(200);
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/interpret',
      ...json({ text: 'x' }),
    });
    expect(res.statusCode).toBe(429);
  });

  it('keys clients by X-Azure-ClientIP when it is a valid IP', async () => {
    const app = testApp({ env: { RATE_LIMIT_MAX: '1' } });
    const call = (ip?: string) =>
      app.inject({ url: '/api/v1/meta', headers: ip ? { 'x-azure-clientip': ip } : {} });
    expect((await call('203.0.113.7')).statusCode).toBe(200);
    expect((await call('203.0.113.7')).statusCode).toBe(429);
    expect((await call('203.0.113.8')).statusCode).toBe(200);
    expect((await call('2001:db8::1')).statusCode).toBe(200);
    // Same /64 network: same client.
    expect((await call('2001:db8::2')).statusCode).toBe(429);
    // Not an IP: the connection address (127.0.0.1) counts.
    expect((await call('not-an-ip')).statusCode).toBe(200);
    expect((await call()).statusCode).toBe(429);
  });

  it('allows 20 saves per client and minute', async () => {
    const app = testApp();
    const payload = json({ text: 'Mentett döntés.', settings: SETTINGS });
    for (let i = 0; i < 20; i++) {
      const res = await app.inject({ method: 'POST', url: '/api/v1/decisions', ...payload });
      expect(res.statusCode).toBe(201);
      expect(res.headers['x-ratelimit-limit']).toBe('20');
    }
    const limited = await app.inject({ method: 'POST', url: '/api/v1/decisions', ...payload });
    expect(limited.statusCode).toBe(429);
    expect(limited.json().error).toBe('rate_limited');
    // Reading is not part of the save budget.
    expect((await app.inject({ url: '/api/v1/meta' })).statusCode).toBe(200);
  });
});

describe('errors', () => {
  it.each([
    ['GET', '/api/v1/nope'],
    ['POST', '/api/v1/nope'],
    ['GET', '/api'],
    ['DELETE', '/api/v1/decisions/AAAAAAAAAA'],
    ['GET', '/nope.txt'],
  ] as const)('%s %s is a JSON 404', async (method, url) => {
    const res = await testApp().inject({ method, url, headers: { accept: 'text/html' } });
    expect(res.statusCode).toBe(404);
    expect(res.headers['content-type']).toContain('application/json');
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.json()).toEqual({ error: 'not_found', message: 'Not found.' });
  });

  it('hides internal errors', async () => {
    class BrokenStore extends MemoryStore {
      override async save(_decision: NewDecision): Promise<SavedDecision> {
        throw new Error('connection to 10.0.0.5 failed: password authentication failed');
      }
    }
    const res = await testApp({ store: new BrokenStore() }).inject({
      method: 'POST',
      url: '/api/v1/decisions',
      ...json({ text: 'x', settings: SETTINGS }),
    });
    expect(res.statusCode).toBe(500);
    expect(res.json()).toEqual({ error: 'internal', message: 'Internal server error.' });
    expect(res.body).not.toContain('10.0.0.5');
    expect(res.body).not.toContain('at ');
  });
});
