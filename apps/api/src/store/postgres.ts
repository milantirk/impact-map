import type { FactorInput } from '@impact-map/engine';
import { ID_ATTEMPTS, newDecisionId } from './id';
import type { DecisionSettings, DecisionStore, NewDecision, SavedDecision } from './types';

/** The part of pg.Pool (and PGlite) that the store needs. */
export interface Queryable {
  query(text: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

export interface PostgresStoreOptions {
  /** releases the connection(s), e.g. pool.end() */
  onClose?: () => Promise<void>;
  newId?: () => string;
}

/** Idempotent: safe on every start and from many replicas. */
export const MIGRATION: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS decisions (
    id text PRIMARY KEY,
    text text NOT NULL,
    factors jsonb,
    settings jsonb NOT NULL,
    model_version text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
  )`,
  'CREATE INDEX IF NOT EXISTS decisions_created_at_idx ON decisions (created_at)',
];

const COLUMNS = 'id, text, factors, settings, model_version, created_at';

const INSERT = `INSERT INTO decisions (id, text, factors, settings, model_version)
  VALUES ($1, $2, $3::jsonb, $4::jsonb, $5)
  ON CONFLICT (id) DO NOTHING
  RETURNING ${COLUMNS}`;

const SELECT_ONE = `SELECT ${COLUMNS} FROM decisions WHERE id = $1`;

/** jsonb arrives parsed from pg and PGlite; a text value is parsed here to be safe. */
function json<T>(value: unknown): T {
  return (typeof value === 'string' ? JSON.parse(value) : value) as T;
}

function timestamp(value: unknown): string {
  const date = value instanceof Date ? value : new Date(String(value));
  if (Number.isNaN(date.getTime())) throw new Error('Invalid created_at value in the database.');
  return date.toISOString();
}

function toDecision(row: unknown): SavedDecision {
  const r = row as Record<string, unknown>;
  return {
    id: String(r.id),
    text: String(r.text),
    factors: r.factors === null || r.factors === undefined ? null : json<FactorInput[]>(r.factors),
    settings: json<DecisionSettings>(r.settings),
    modelVersion: String(r.model_version),
    createdAt: timestamp(r.created_at),
  };
}

/** Decision store on PostgreSQL. Parameterised queries only. */
export class PostgresStore implements DecisionStore {
  readonly #db: Queryable;
  readonly #onClose: (() => Promise<void>) | undefined;
  readonly #newId: () => string;

  constructor(db: Queryable, options: PostgresStoreOptions = {}) {
    this.#db = db;
    this.#onClose = options.onClose;
    this.#newId = options.newId ?? newDecisionId;
  }

  async init(): Promise<void> {
    for (const statement of MIGRATION) await this.#db.query(statement);
  }

  async ping(): Promise<void> {
    await this.#db.query('SELECT 1');
  }

  async save(decision: NewDecision): Promise<SavedDecision> {
    const factors = decision.factors === null ? null : JSON.stringify(decision.factors);
    const settings = JSON.stringify(decision.settings);
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
      const params = [this.#newId(), decision.text, factors, settings, decision.modelVersion];
      const { rows } = await this.#db.query(INSERT, params);
      if (rows[0] !== undefined) return toDecision(rows[0]);
    }
    throw new Error('Could not create a unique decision id.');
  }

  async get(id: string): Promise<SavedDecision | null> {
    const { rows } = await this.#db.query(SELECT_ONE, [id]);
    return rows[0] === undefined ? null : toDecision(rows[0]);
  }

  async close(): Promise<void> {
    await this.#onClose?.();
  }
}
