import {
  analyze,
  interpret,
  LIMITS,
  scoreDeltas,
  type FactorInput,
  type ImpactMap,
  type Interpretation,
  type Lang,
} from '@impact-map/engine';
import { DETAIL_LEVELS } from './format';

export interface Settings {
  steps: number;
  people: number;
  windowDays: number;
  /** 'auto' = from the text, 'sustained' = kept for good, number = days */
  duration: 'auto' | 'sustained' | number;
  detail: 0 | 1 | 2;
}

/** The user's edits on top of the factors found in the text. */
export interface Overrides {
  removed: string[];
  added: string[];
  intensity: Record<string, number>;
}

export const DEFAULT_SETTINGS: Settings = {
  steps: LIMITS.steps.default,
  people: 1,
  windowDays: LIMITS.windowDays.default,
  duration: 'auto',
  detail: 1,
};
export const NO_OVERRIDES: Overrides = { removed: [], added: [], intensity: {} };
export const INTENSITY_LEVELS = [0.25, 0.5, 0.75, 1] as const;

export function effectiveFactors(interpretation: Interpretation, o: Overrides): FactorInput[] {
  const list = interpretation.factors
    .filter((f) => !o.removed.includes(f.id))
    .map((f) => ({ id: f.id, intensity: o.intensity[f.id] ?? f.intensity }));
  for (const id of o.added) {
    if (!list.some((f) => f.id === id)) list.push({ id, intensity: o.intensity[id] ?? 1 });
  }
  return list.slice(0, LIMITS.factorsMax);
}

export const durationDays = (s: Settings) =>
  s.duration === 'auto' ? undefined : s.duration === 'sustained' ? null : s.duration;

export interface Analysis {
  interpretation: Interpretation;
  map: ImpactMap;
  /** score change against one person in a one-year window; null when the scenario is the base case */
  deltas: Record<string, number> | null;
}

export function runAnalysis(
  text: string,
  overrides: Overrides,
  settings: Settings,
  lang: Lang,
): Analysis {
  const interpretation = interpret(text, lang);
  const factors = effectiveFactors(interpretation, overrides);
  const base = { text, factors, steps: settings.steps, durationDays: durationDays(settings), lang };
  const map = analyze({
    ...base,
    people: settings.people,
    windowDays: settings.windowDays,
    tree: DETAIL_LEVELS[settings.detail],
  });
  const isBase = settings.people === 1 && settings.windowDays === LIMITS.windowDays.default;
  const deltas =
    isBase || factors.length === 0
      ? null
      : scoreDeltas(
          analyze({ ...base, people: 1, windowDays: LIMITS.windowDays.default, tree: false }),
          map,
        );
  return { interpretation, map, deltas };
}

/** Overrides that turn the factors found in the text into a saved factor list. */
export function overridesFor(
  interpretation: Interpretation,
  saved: FactorInput[] | null,
): Overrides {
  if (!saved) return NO_OVERRIDES;
  const found = new Map(interpretation.factors.map((f) => [f.id, f.intensity]));
  const keep = new Set(saved.map((f) => f.id));
  return {
    removed: [...found.keys()].filter((id) => !keep.has(id)),
    added: saved.filter((f) => !found.has(f.id)).map((f) => f.id),
    intensity: Object.fromEntries(
      saved.filter((f) => found.get(f.id) !== f.intensity).map((f) => [f.id, f.intensity]),
    ),
  };
}

const STORAGE_KEY = 'impact-map/v1';

export interface Stored {
  text: string;
  overrides: Overrides;
  settings: Settings;
  lang: Lang;
  theme: 'light' | 'dark' | null;
}

export function loadStored(): Partial<Stored> {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Partial<Stored>) : {};
  } catch {
    return {};
  }
}

export function saveStored(value: Stored) {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(value));
  } catch {
    // storage full or blocked: the app still works without it
  }
}
