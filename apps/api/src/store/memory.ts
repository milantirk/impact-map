import { ID_ATTEMPTS, newDecisionId } from './id';
import type { DecisionStore, NewDecision, SavedDecision } from './types';

export interface MemoryStoreOptions {
  /** oldest decisions are dropped above this count, so memory use stays bounded */
  maxEntries?: number;
  newId?: () => string;
}

/** Non-persistent store for development and tests: everything is lost on restart. */
export class MemoryStore implements DecisionStore {
  readonly #decisions = new Map<string, SavedDecision>();
  readonly #maxEntries: number;
  readonly #newId: () => string;

  constructor(options: MemoryStoreOptions = {}) {
    this.#maxEntries = options.maxEntries ?? 10_000;
    this.#newId = options.newId ?? newDecisionId;
  }

  get size(): number {
    return this.#decisions.size;
  }

  async init(): Promise<void> {}

  async ping(): Promise<void> {}

  async save(decision: NewDecision): Promise<SavedDecision> {
    for (let attempt = 0; attempt < ID_ATTEMPTS; attempt++) {
      const id = this.#newId();
      if (this.#decisions.has(id)) continue;
      const saved: SavedDecision = {
        id,
        ...structuredClone(decision),
        createdAt: new Date().toISOString(),
      };
      this.#decisions.set(id, saved);
      while (this.#decisions.size > this.#maxEntries) {
        const oldest = this.#decisions.keys().next();
        if (oldest.done) break;
        this.#decisions.delete(oldest.value);
      }
      return structuredClone(saved);
    }
    throw new Error('Could not create a unique decision id.');
  }

  async get(id: string): Promise<SavedDecision | null> {
    const saved = this.#decisions.get(id);
    return saved ? structuredClone(saved) : null;
  }

  async close(): Promise<void> {
    this.#decisions.clear();
  }
}
