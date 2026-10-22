import { PGlite } from '@electric-sql/pglite';
import type { AccessToken, TokenCredential } from '@azure/identity';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { DatabaseConfig } from '../src/config';
import { createStore } from '../src/store';
import { isDecisionId, newDecisionId } from '../src/store/id';
import { MemoryStore } from '../src/store/memory';
import {
  azureCredential,
  describeTarget,
  ENTRA_SCOPE,
  entraPassword,
  poolConfig,
} from '../src/store/pg';
import { PostgresStore } from '../src/store/postgres';
import type { NewDecision } from '../src/store/types';

const DECISION: NewDecision = {
  text: 'Minden nap biciklivel megyek dolgozni.',
  factors: [{ id: 'bike_commute', intensity: 1 }],
  settings: { steps: 3, people: 1, windowDays: 365, durationDays: null, lang: 'hu' },
  modelVersion: '1.0.0',
};

/** Returns the given ids in order (then repeats the last one). */
function ids(...values: string[]) {
  let next = 0;
  return () => values[Math.min(next++, values.length - 1)] ?? '';
}

describe('decision ids', () => {
  it('are 10 URL-safe random characters', () => {
    const seen = new Set(Array.from({ length: 1000 }, newDecisionId));
    expect(seen.size).toBe(1000);
    for (const id of seen) expect(isDecisionId(id)).toBe(true);
  });

  it('reject other formats', () => {
    for (const id of ['', 'abc', 'abcdefghijk', 'abcdefghi/', 'abcdefghi.', 'ÁBCDEFGHIJ']) {
      expect(isDecisionId(id)).toBe(false);
    }
  });
});

describe('PostgresStore on PGlite', () => {
  let db: PGlite;

  beforeAll(async () => {
    db = new PGlite();
    await new PostgresStore(db).init();
  });

  afterAll(async () => {
    await db.close();
  });

  it('migrates idempotently and creates the created_at index', async () => {
    const store = new PostgresStore(db);
    await store.init();
    await store.init();
    const { rows } = await db.query<{ indexname: string }>(
      "SELECT indexname FROM pg_indexes WHERE tablename = 'decisions' ORDER BY indexname",
    );
    expect(rows.map((r) => r.indexname)).toEqual(['decisions_created_at_idx', 'decisions_pkey']);
  });

  it('pings', async () => {
    await expect(new PostgresStore(db).ping()).resolves.toBeUndefined();
  });

  it('saves and loads a decision with JSON columns and an ISO timestamp', async () => {
    const store = new PostgresStore(db);
    const saved = await store.save(DECISION);
    expect(saved).toMatchObject({ ...DECISION, id: expect.stringMatching(/^[\w-]{10}$/) });
    expect(new Date(saved.createdAt).toISOString()).toBe(saved.createdAt);
    expect(await store.get(saved.id)).toEqual(saved);
    expect(await store.get('AAAAAAAAAA')).toBeNull();
  });

  it('stores null factors as SQL NULL', async () => {
    const saved = await new PostgresStore(db).save({ ...DECISION, factors: null });
    const { rows } = await db.query<{ isnull: boolean }>(
      'SELECT factors IS NULL AS isnull FROM decisions WHERE id = $1',
      [saved.id],
    );
    expect(rows[0]?.isnull).toBe(true);
  });

  it('keeps hostile text as plain data (parameterised queries)', async () => {
    const text = "x'); DROP TABLE decisions; --";
    const store = new PostgresStore(db);
    const saved = await store.save({ ...DECISION, text });
    expect((await store.get(saved.id))?.text).toBe(text);
  });

  it('retries with a new id after a collision', async () => {
    const store = new PostgresStore(db, { newId: ids('collide001', 'collide001', 'collide002') });
    const first = await store.save(DECISION);
    const second = await store.save({ ...DECISION, text: 'second' });
    expect([first.id, second.id]).toEqual(['collide001', 'collide002']);
    expect((await store.get('collide001'))?.text).toBe(DECISION.text);
  });

  it('gives up when every id collides', async () => {
    const store = new PostgresStore(db, { newId: ids('always0001') });
    await store.save(DECISION);
    await expect(store.save(DECISION)).rejects.toThrow('unique decision id');
  });

  it('runs the close callback', async () => {
    const onClose = vi.fn(async () => {});
    await new PostgresStore(db, { onClose }).close();
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('accepts text JSON and string timestamps from other drivers', async () => {
    const row = {
      id: 'textjson01',
      text: 't',
      factors: '[{"id":"a","intensity":1}]',
      settings: JSON.stringify(DECISION.settings),
      model_version: '1.0.0',
      created_at: '2026-01-02T03:04:05.000Z',
    };
    const store = new PostgresStore({ query: async () => ({ rows: [row] }) });
    expect(await store.get('textjson01')).toEqual({
      id: 'textjson01',
      text: 't',
      factors: [{ id: 'a', intensity: 1 }],
      settings: DECISION.settings,
      modelVersion: '1.0.0',
      createdAt: '2026-01-02T03:04:05.000Z',
    });
  });
});

describe('MemoryStore', () => {
  it('returns copies, so saved decisions cannot change', async () => {
    const store = new MemoryStore();
    const input = structuredClone(DECISION);
    const saved = await store.save(input);
    input.text = 'changed';
    saved.settings.steps = 7;
    const loaded = await store.get(saved.id);
    expect(loaded?.text).toBe(DECISION.text);
    expect(loaded?.settings.steps).toBe(3);
  });

  it('drops the oldest decisions above the limit', async () => {
    const store = new MemoryStore({ maxEntries: 2 });
    const first = await store.save(DECISION);
    await store.save(DECISION);
    await store.save(DECISION);
    expect(store.size).toBe(2);
    expect(await store.get(first.id)).toBeNull();
  });

  it('retries with a new id after a collision and gives up after 5 tries', async () => {
    const store = new MemoryStore({ newId: ids('same000001', 'same000001', 'other00001') });
    expect((await store.save(DECISION)).id).toBe('same000001');
    expect((await store.save(DECISION)).id).toBe('other00001');
    await expect(store.save(DECISION)).rejects.toThrow('unique decision id');
  });

  it('is always ready and forgets everything on close', async () => {
    const store = new MemoryStore();
    await store.init();
    await expect(store.ping()).resolves.toBeUndefined();
    const saved = await store.save(DECISION);
    await store.close();
    expect(await store.get(saved.id)).toBeNull();
  });
});

describe('Microsoft Entra password', () => {
  function fakeCredential(): TokenCredential & { scopes: string[] } {
    const scopes: string[] = [];
    let n = 0;
    return {
      scopes,
      async getToken(scope: string | string[]): Promise<AccessToken> {
        scopes.push(String(scope));
        n += 1;
        return { token: `token-${n}`, expiresOnTimestamp: Date.now() + 3_600_000 };
      },
    };
  }

  it('asks the credential for a token for every new connection', async () => {
    const credential = fakeCredential();
    const password = entraPassword(credential);
    expect(await password()).toBe('token-1');
    expect(await password()).toBe('token-2');
    expect(credential.scopes).toEqual([ENTRA_SCOPE, ENTRA_SCOPE]);
  });

  it('fails when no token comes back', async () => {
    const password = entraPassword({ getToken: async () => null });
    await expect(password()).rejects.toThrow('no token');
  });
});

describe('pg pool configuration', () => {
  const entra = (ssl = { rejectUnauthorized: true, verifyHostname: true }) =>
    ({
      kind: 'entra',
      host: 'db.postgres.database.azure.com',
      port: 5432,
      database: 'impactmap',
      user: 'impact-map-identity',
      ssl,
      clientId: 'client-id',
    }) satisfies DatabaseConfig;

  it('uses DATABASE_URL as is', async () => {
    const config = await poolConfig({ kind: 'url', connectionString: 'postgres://u:p@h:5/db' });
    expect(config).toMatchObject({ connectionString: 'postgres://u:p@h:5/db', max: 10 });
    expect(config.password).toBeUndefined();
  });

  it('uses TLS and an Entra token as the password', async () => {
    const credential = vi.fn(async (_clientId: string | undefined): Promise<TokenCredential> => ({
      getToken: async () => ({ token: 'entra-token', expiresOnTimestamp: Date.now() + 60_000 }),
    }));
    const config = await poolConfig(entra(), credential);
    expect(credential).toHaveBeenCalledWith('client-id');
    expect(config).toMatchObject({
      host: 'db.postgres.database.azure.com',
      port: 5432,
      database: 'impactmap',
      user: 'impact-map-identity',
      ssl: { rejectUnauthorized: true },
    });
    expect(typeof config.password).toBe('function');
    const password = config.password as () => Promise<string>;
    expect(await password()).toBe('entra-token');
  });

  it('skips only the host name check for verify-ca', async () => {
    const credential = async () => ({ getToken: async () => null });
    const config = await poolConfig(
      entra({ rejectUnauthorized: true, verifyHostname: false }),
      credential,
    );
    const ssl = config.ssl as {
      rejectUnauthorized: boolean;
      checkServerIdentity?: () => undefined;
    };
    expect(ssl.rejectUnauthorized).toBe(true);
    expect(ssl.checkServerIdentity?.()).toBeUndefined();
  });

  it('picks a managed identity for a client id, else the default credential chain', async () => {
    const identity = await import('@azure/identity');
    const clientId = '00000000-0000-0000-0000-000000000001';
    expect(await azureCredential(clientId)).toBeInstanceOf(identity.ManagedIdentityCredential);
    expect(await azureCredential(undefined)).toBeInstanceOf(identity.DefaultAzureCredential);
  });

  it('describes the target without secrets', () => {
    expect(describeTarget({ kind: 'url', connectionString: 'postgres://u:secret@h:5432/db' })).toBe(
      'postgres://h:5432/db (DATABASE_URL)',
    );
    expect(describeTarget({ kind: 'url', connectionString: 'not a url' })).toBe(
      'postgres (DATABASE_URL)',
    );
    expect(describeTarget(entra())).toBe(
      'postgres://impact-map-identity@db.postgres.database.azure.com:5432/impactmap (Microsoft Entra ID)',
    );
  });
});

describe('createStore', () => {
  it('uses the in-memory store without a database', async () => {
    const handle = await createStore({ kind: 'memory' }, () => {});
    expect(handle.store).toBeInstanceOf(MemoryStore);
    expect(handle.persistent).toBe(false);
  });

  it('uses a pg pool for DATABASE_URL (no connection until the first query)', async () => {
    const handle = await createStore(
      { kind: 'url', connectionString: 'postgres://u:secret@127.0.0.1:1/db' },
      () => {},
    );
    expect(handle.store).toBeInstanceOf(PostgresStore);
    expect(handle.persistent).toBe(true);
    expect(handle.target).not.toContain('secret');
    await handle.store.close();
  });
});
