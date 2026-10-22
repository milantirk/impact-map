import type { Evidence, Lag, Scope } from './types';

export const MODEL_VERSION = '1.0.0';

/** Evidence grade -> weight of the link (c). */
export const EVIDENCE_WEIGHT: Readonly<Record<Evidence, number>> = {
  A: 0.95,
  B: 0.8,
  C: 0.6,
  D: 0.4,
};
export const EVIDENCE_ORDER: readonly Evidence[] = ['A', 'B', 'C', 'D'];
export const LAGS: readonly Lag[] = ['short', 'mid', 'long'];
export const SCOPES: readonly Scope[] = ['individual', 'community', 'society', 'global'];

/** Damping per spread step. */
export const ALPHA = 0.6;
/** Subarea normalisation: h = tanh(E / TAU). */
export const TAU = 0.6;
/** Main area normalisation. */
export const AREA_TAU = 1.2;
/** Upper limit of the people scaling. */
export const SIGMA_MAX = 1.5;
/** log10 of the group size at which a scope is fully reached. */
export const SCOPE_LEVEL: Readonly<Record<Scope, number>> = {
  individual: 0,
  community: 3,
  society: 5,
  global: 7,
};

/**
 * Time window (model assumption, D): effects of people who decide within this many days overlap.
 * A longer window spreads short effects out; long effects add up anyway.
 */
export const OVERLAP_DAYS: Readonly<Record<Lag, number>> = { short: 365, mid: 1825, long: 9125 };

/**
 * Duration (model assumption, D): a decision kept for D days gives min(1, D / days) of the effect.
 * Without a duration the decision counts as sustained.
 */
export const BUILDUP_DAYS: Readonly<Record<Lag, number>> = { short: 90, mid: 730, long: 1825 };

export const LIMITS = {
  textMax: 5000,
  factorsMax: 20,
  intensity: { min: 0.05, max: 1 },
  steps: { min: 1, max: 7, default: 3 },
  people: { min: 1, max: 1_000_000_000, default: 1 },
  windowDays: { min: 1, max: 36_500, default: 365 },
  durationDays: { min: 1, max: 36_500 },
  tree: { minValue: 0.003, maxNodes: 400, maxNodesLimit: 2000 },
} as const;

/** Below this |score| an impact counts as negligible. */
export const NEGLIGIBLE = 0.02;
