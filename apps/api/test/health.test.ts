import { MODEL_VERSION } from '@impact-map/engine';
import { describe, expect, it } from 'vitest';
import { withTimeout } from '../src/routes/health';
import { MemoryStore } from '../src/store/memory';
import { testApp } from './helpers';

class FailingStore extends MemoryStore {
  override async ping(): Promise<void> {
    throw new Error('database is down');
  }
}

describe('health', () => {
  it('GET /healthz reports liveness and the model version', async () => {
    const res = await testApp().inject({ method: 'GET', url: '/healthz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ok', version: MODEL_VERSION });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /healthz stays up when the store is down', async () => {
    const res = await testApp({ store: new FailingStore() }).inject({ url: '/healthz' });
    expect(res.statusCode).toBe(200);
  });

  it('GET /readyz is ready when the store answers', async () => {
    const res = await testApp().inject({ method: 'GET', url: '/readyz' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: 'ready' });
    expect(res.headers['cache-control']).toBe('no-store');
  });

  it('GET /readyz is 503 when the store fails', async () => {
    const res = await testApp({ store: new FailingStore() }).inject({ url: '/readyz' });
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: 'unavailable' });
  });

  it('health checks are not rate limited', async () => {
    const app = testApp({ env: { RATE_LIMIT_MAX: '1' } });
    for (let i = 0; i < 5; i++) {
      const res = await app.inject({ url: '/healthz' });
      expect(res.statusCode).toBe(200);
      expect(res.headers['x-ratelimit-limit']).toBeUndefined();
    }
  });
});

describe('withTimeout', () => {
  it('passes the result through', async () => {
    await expect(withTimeout(Promise.resolve('ok'), 50)).resolves.toBe('ok');
  });

  it('rejects when the store does not answer in time', async () => {
    const hanging = new Promise<never>(() => {});
    await expect(withTimeout(hanging, 10)).rejects.toThrow('timed out after 10 ms');
  });
});
