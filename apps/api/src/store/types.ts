import type { FactorInput, Lang } from '@impact-map/engine';

/** The scenario settings saved with a decision model. */
export interface DecisionSettings {
  steps: number;
  people: number;
  windowDays: number;
  /** null = the decision is kept (sustained) */
  durationDays: number | null;
  lang: Lang;
}

export interface NewDecision {
  text: string;
  /** explicit factor list; null = the factors come from the text */
  factors: FactorInput[] | null;
  settings: DecisionSettings;
  modelVersion: string;
}

/** A saved, immutable decision model. */
export interface SavedDecision extends NewDecision {
  id: string;
  /** ISO 8601 timestamp */
  createdAt: string;
}

export interface DecisionStore {
  /** Prepares the storage (idempotent migration). */
  init(): Promise<void>;
  /** Resolves when the storage can serve requests, rejects otherwise. */
  ping(): Promise<void>;
  /** Saves a new decision under a new random id. */
  save(decision: NewDecision): Promise<SavedDecision>;
  get(id: string): Promise<SavedDecision | null>;
  close(): Promise<void>;
}
