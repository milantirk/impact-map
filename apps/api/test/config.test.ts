import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ConfigError, defaultStaticDir, loadConfig } from '../src/config';
import { FIXTURES, PUBLIC_DIR } from './helpers';

describe('loadConfig', () => {
  it('has safe defaults', () => {
    const config = loadConfig({});
    expect(config).toMatchObject({
      port: 8080,
      host: '127.0.0.1',
      trustProxy: false,
      logLevel: 'info',
      rateLimitMax: 120,
      database: { kind: 'memory' },
      warnings: [],
    });
    expect(path.isAbsolute(config.staticDir)).toBe(true);
  });

  it('listens on all interfaces only in production', () => {
    expect(loadConfig({ NODE_ENV: 'production' }).host).toBe('0.0.0.0');
    expect(loadConfig({ NODE_ENV: 'development' }).host).toBe('127.0.0.1');
    expect(loadConfig({ NODE_ENV: 'production', HOST: '127.0.0.1' }).host).toBe('127.0.0.1');
  });

  it('reads every setting', () => {
    const config = loadConfig({
      PORT: '9000',
      HOST: '127.0.0.1',
      STATIC_DIR: PUBLIC_DIR,
      TRUST_PROXY: 'true',
      LOG_LEVEL: 'DEBUG',
      RATE_LIMIT_MAX: '30',
    });
    expect(config).toMatchObject({
      port: 9000,
      host: '127.0.0.1',
      staticDir: PUBLIC_DIR,
      trustProxy: true,
      logLevel: 'debug',
      rateLimitMax: 30,
    });
  });

  it('ignores empty values', () => {
    const config = loadConfig({ PORT: '', DATABASE_URL: ' ', TRUST_PROXY: '' });
    expect(config).toMatchObject({ port: 8080, trustProxy: false, database: { kind: 'memory' } });
  });

  it.each([
    ['PORT', 'http'],
    ['PORT', '70000'],
    ['TRUST_PROXY', 'maybe'],
    ['LOG_LEVEL', 'loud'],
    ['RATE_LIMIT_MAX', '0'],
    ['DB_AUTH', 'kerberos'],
    ['PGSSLMODE', 'sometimes'],
  ])('rejects %s=%s', (key, value) => {
    expect(() => loadConfig({ [key]: value })).toThrow(ConfigError);
    expect(() => loadConfig({ [key]: value })).toThrow(key);
  });

  it('uses DATABASE_URL for Postgres', () => {
    const url = 'postgres://app:secret@db:5432/impact?sslmode=require';
    expect(loadConfig({ DATABASE_URL: url }).database).toEqual({
      kind: 'url',
      connectionString: url,
    });
  });

  it('prefers DATABASE_URL over DB_AUTH=entra, with a warning', () => {
    const config = loadConfig({ DATABASE_URL: 'postgres://db/x', DB_AUTH: 'entra', PGHOST: 'h' });
    expect(config.database.kind).toBe('url');
    expect(config.warnings).toHaveLength(1);
  });

  it('uses Microsoft Entra ID with DB_AUTH=entra and PGHOST', () => {
    const config = loadConfig({
      DB_AUTH: 'entra',
      PGHOST: 'impact.postgres.database.azure.com',
      PGUSER: 'impact-map-identity',
      PGDATABASE: 'impactmap',
      AZURE_CLIENT_ID: '00000000-0000-0000-0000-000000000001',
    });
    expect(config.database).toEqual({
      kind: 'entra',
      host: 'impact.postgres.database.azure.com',
      port: 5432,
      database: 'impactmap',
      user: 'impact-map-identity',
      ssl: { rejectUnauthorized: true, verifyHostname: true },
      clientId: '00000000-0000-0000-0000-000000000001',
    });
  });

  it.each([
    [undefined, { rejectUnauthorized: true, verifyHostname: true }],
    ['verify-full', { rejectUnauthorized: true, verifyHostname: true }],
    ['verify-ca', { rejectUnauthorized: true, verifyHostname: false }],
    ['require', { rejectUnauthorized: false, verifyHostname: false }],
    ['no-verify', { rejectUnauthorized: false, verifyHostname: false }],
  ])('maps PGSSLMODE=%s for Entra', (mode, ssl) => {
    const env = { DB_AUTH: 'entra', PGHOST: 'h', PGUSER: 'u', PGPORT: '6432' };
    const config = loadConfig(mode ? { ...env, PGSSLMODE: mode } : env);
    expect(config.database).toMatchObject({ kind: 'entra', port: 6432, ssl, clientId: undefined });
  });

  it('refuses Entra without TLS, host or user', () => {
    const env = { DB_AUTH: 'entra', PGHOST: 'h', PGUSER: 'u' };
    expect(() => loadConfig({ ...env, PGSSLMODE: 'disable' })).toThrow(ConfigError);
    expect(() => loadConfig({ ...env, PGHOST: '' })).toThrow('PGHOST');
    expect(() => loadConfig({ ...env, PGUSER: '' })).toThrow('PGUSER');
  });

  it('warns when PGHOST is set without a database mode', () => {
    const config = loadConfig({ PGHOST: 'db' });
    expect(config.database).toEqual({ kind: 'memory' });
    expect(config.warnings[0]).toContain('in-memory');
  });
});

describe('defaultStaticDir', () => {
  it('uses ./public next to the server file when it exists (container)', () => {
    expect(defaultStaticDir(FIXTURES)).toBe(PUBLIC_DIR);
  });

  it('uses apps/web/dist in the repository', () => {
    const apiSrc = path.resolve(FIXTURES, '../../src');
    expect(defaultStaticDir(apiSrc)).toBe(path.resolve(apiSrc, '../../web/dist'));
    expect(loadConfig({}, apiSrc).staticDir).toBe(path.resolve(apiSrc, '../../web/dist'));
  });
});
