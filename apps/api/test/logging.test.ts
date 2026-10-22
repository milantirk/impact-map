import { describe, expect, it } from 'vitest';
import { buildApp } from '../src/app';
import { MemoryStore } from '../src/store/memory';
import { testConfig } from './helpers';

function logApp(level: string) {
  const lines: Array<Record<string, unknown>> = [];
  const app = buildApp({
    config: testConfig({ LOG_LEVEL: level }),
    store: new MemoryStore(),
    logStream: { write: (line) => lines.push(JSON.parse(line) as Record<string, unknown>) },
  });
  return { app, lines };
}

describe('logging', () => {
  it('writes JSON lines with the request id and no credentials', async () => {
    const { app, lines } = logApp('info');
    await app.inject({
      url: '/api/v1/meta',
      headers: {
        'x-request-id': 'log-test-1',
        authorization: 'Bearer top-secret',
        cookie: 'session=top-secret',
      },
    });
    await app.close();
    expect(lines.some((l) => l.reqId === 'log-test-1' && l.msg === 'request completed')).toBe(true);
    expect(JSON.stringify(lines)).not.toContain('top-secret');
  });

  it('redacts authorization and cookie headers when they are logged', async () => {
    const { app, lines } = logApp('info');
    app.log.info({ headers: { authorization: 'Bearer x', cookie: 'a=b', accept: '*/*' } }, 'h');
    await app.close();
    expect(lines.find((l) => l.msg === 'h')?.headers).toEqual({
      authorization: '[redacted]',
      cookie: '[redacted]',
      accept: '*/*',
    });
  });

  it('keeps health probes out of the log at the default level', async () => {
    const { app, lines } = logApp('info');
    await app.inject({ url: '/healthz' });
    await app.inject({ url: '/readyz' });
    await app.close();
    expect(lines.filter((l) => l.reqId !== undefined)).toEqual([]);
  });

  it('logs nothing when LOG_LEVEL=silent', async () => {
    const { app, lines } = logApp('silent');
    await app.inject({ url: '/healthz' });
    await app.inject({ url: '/api/v1/nope' });
    await app.close();
    expect(lines).toEqual([]);
  });
});
