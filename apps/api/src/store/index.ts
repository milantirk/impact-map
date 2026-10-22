import type { DatabaseConfig } from '../config';
import { MemoryStore } from './memory';
import { describeTarget, poolConfig } from './pg';
import { PostgresStore } from './postgres';
import type { DecisionStore } from './types';

export { MemoryStore } from './memory';
export { PostgresStore, type Queryable } from './postgres';
export type { DecisionSettings, DecisionStore, NewDecision, SavedDecision } from './types';

export interface StoreHandle {
  store: DecisionStore;
  persistent: boolean;
  /** human-readable target for logs, without secrets */
  target: string;
}

/**
 * DATABASE_URL -> Postgres with that URL; DB_AUTH=entra -> Postgres with an Entra token;
 * otherwise an in-memory store. pg and @azure/identity load only when they are needed.
 */
export async function createStore(
  db: DatabaseConfig,
  onPoolError: (error: Error) => void,
): Promise<StoreHandle> {
  if (db.kind === 'memory') {
    return { store: new MemoryStore(), persistent: false, target: 'memory' };
  }
  const { Pool } = await import('pg');
  const pool = new Pool(await poolConfig(db));
  // Without a listener, an idle client error (e.g. a server restart) would crash the process.
  pool.on('error', onPoolError);
  const store = new PostgresStore(pool, { onClose: () => pool.end() });
  return { store, persistent: true, target: describeTarget(db) };
}
