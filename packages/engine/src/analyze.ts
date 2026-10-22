import {
  ALPHA,
  AREA_TAU,
  BUILDUP_DAYS,
  EVIDENCE_WEIGHT,
  LAGS,
  LIMITS,
  MODEL_VERSION,
  OVERLAP_DAYS,
  SCOPE_LEVEL,
  SIGMA_MAX,
  TAU,
} from './constants';
import { interpret as interpretText, precisionOf } from './interpret';
import { knowledge, labels } from './knowledge';
import { computeModel, effectivePeople, persistence, prepare, type Scenario } from './model';
import { buildTree, DEFAULT_TREE, type TreeOptions } from './tree';
import {
  InputError,
  type FactorInput,
  type ImpactMap,
  type Interpretation,
  type KnowledgeBase,
  type Lag,
  type Lang,
} from './types';

export interface AnalyzeInput {
  /** decision model in plain words, from 2 words to many sentences */
  text?: string;
  /** explicit factor list; replaces the factors found in the text (intensity defaults to 1) */
  factors?: Array<{ id: string; intensity?: number }>;
  /** edges from the decision, 1..7 (1 = direct effects only) */
  steps?: number;
  /** how many people decide this way */
  people?: number;
  /** within how many days they decide */
  windowDays?: number;
  /** how long the decision is kept; null = sustained; omitted = taken from the text */
  durationDays?: number | null;
  lang?: Lang;
  /** false = no tree */
  tree?: boolean | Partial<TreeOptions>;
}

function checkLang(lang: unknown): Lang {
  if (lang === undefined) return 'hu';
  if (lang === 'hu' || lang === 'en') return lang;
  throw new InputError('lang must be "hu" or "en".');
}

function clampInt(
  value: unknown,
  name: string,
  range: { min: number; max: number },
  fallback: number,
): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value))
    throw new InputError(`${name} must be a finite number.`);
  return Math.min(range.max, Math.max(range.min, Math.round(value)));
}

function finite(value: unknown, name: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new InputError(`${name} must be a finite number.`);
  }
  return Math.min(max, Math.max(min, value));
}

export function cleanFactors(factors: unknown, kb: KnowledgeBase): FactorInput[] {
  if (!Array.isArray(factors) || factors.length > LIMITS.factorsMax) {
    throw new InputError(`factors must be a list of at most ${LIMITS.factorsMax} items.`);
  }
  const seen = new Set<string>();
  const clean: FactorInput[] = [];
  for (const item of factors as unknown[]) {
    const id = (item as FactorInput | null)?.id;
    if (typeof id !== 'string' || !kb.factors.has(id)) {
      throw new InputError(`Unknown factor: ${String(id).slice(0, 60)}`);
    }
    if (seen.has(id)) continue;
    seen.add(id);
    const raw = (item as FactorInput).intensity ?? 1;
    if (typeof raw !== 'number' || !Number.isFinite(raw))
      throw new InputError('intensity must be a finite number.');
    clean.push({
      id,
      intensity: Math.min(LIMITS.intensity.max, Math.max(LIMITS.intensity.min, raw)),
    });
  }
  return clean;
}

export function interpret(
  text: string,
  lang: Lang = 'hu',
  kb: KnowledgeBase = knowledge,
): Interpretation {
  if (typeof text !== 'string') throw new InputError('text must be a string.');
  return interpretText(text, kb, checkLang(lang));
}

/** Decision model -> impact map: the general equation, the impact tree and the decision categories. */
export function analyze(input: AnalyzeInput = {}, kb: KnowledgeBase = knowledge): ImpactMap {
  const lang = checkLang(input.lang);
  if (input.text !== undefined && typeof input.text !== 'string')
    throw new InputError('text must be a string.');
  const interpretation = interpretText(input.text ?? '', kb, lang);
  const factors =
    input.factors !== undefined
      ? cleanFactors(input.factors, kb)
      : interpretation.factors.map(({ id, intensity }) => ({ id, intensity }));
  const hasSpecific = factors.some((f) => !kb.factors.get(f.id)!.fallback);
  const durationDays =
    input.durationDays === undefined
      ? interpretation.durationDays
      : input.durationDays === null
        ? null
        : clampInt(
            input.durationDays,
            'durationDays',
            LIMITS.durationDays,
            LIMITS.durationDays.min,
          );
  const scenario: Scenario = {
    factors,
    steps: clampInt(input.steps, 'steps', LIMITS.steps, LIMITS.steps.default),
    people: clampInt(input.people, 'people', LIMITS.people, LIMITS.people.default),
    windowDays: clampInt(
      input.windowDays,
      'windowDays',
      LIMITS.windowDays,
      LIMITS.windowDays.default,
    ),
    durationDays,
    precision: precisionOf(interpretation.facets, hasSpecific, factors.length > 0),
  };

  const l = labels(kb, lang);
  const prepared = prepare(kb, scenario);
  const model = computeModel(kb, scenario, l, prepared);

  let tree: ImpactMap['tree'] = null;
  let treeStats: ImpactMap['treeStats'] = null;
  if (input.tree !== false && factors.length > 0) {
    const opts = typeof input.tree === 'object' ? input.tree : {};
    const options: TreeOptions = {
      minValue: finite(opts.minValue, 'tree.minValue', DEFAULT_TREE.minValue, 0, 1),
      maxNodes: Math.round(
        finite(opts.maxNodes, 'tree.maxNodes', DEFAULT_TREE.maxNodes, 1, LIMITS.tree.maxNodesLimit),
      ),
    };
    const names = factors.map((f) => l.factor(f.id));
    const rootLabel =
      names.length > 3
        ? `${names.slice(0, 3).join(' · ')} +${names.length - 3}`
        : names.join(' · ');
    const built = buildTree(kb, prepared, scenario, l, options, rootLabel, model.totals);
    built.tree.score = model.net;
    tree = built.tree;
    treeStats = built.stats;
  }

  return {
    modelVersion: MODEL_VERSION,
    lang,
    interpretation,
    factors: factors.map((f) => ({
      ...f,
      label: l.factor(f.id),
      group: l.group(kb.factors.get(f.id)!.group),
    })),
    params: {
      steps: scenario.steps,
      people: scenario.people,
      windowDays: scenario.windowDays,
      durationDays,
      precision: scenario.precision,
      effectivePeople: perLag((lag) => effectivePeople(scenario.people, scenario.windowDays, lag)),
      persistence: perLag((lag) => persistence(durationDays, lag)),
    },
    areas: model.areas,
    net: model.net,
    profile: model.profile,
    tree,
    treeStats,
  };
}

const perLag = (f: (lag: Lag) => number) =>
  Object.fromEntries(LAGS.map((lag) => [lag, f(lag)])) as Record<Lag, number>;

/** Score change of every subarea between two maps (b - a). */
export function scoreDeltas(a: ImpactMap, b: ImpactMap): Record<string, number> {
  const before = new Map(a.areas.flatMap((x) => x.children).map((c) => [c.id, c.score] as const));
  return Object.fromEntries(
    b.areas
      .flatMap((x) => x.children)
      .map((c) => [c.id, c.score - (before.get(c.id) ?? 0)] as const),
  );
}

/** Everything a client needs to show the knowledge base. */
export function catalog(lang: Lang = 'hu', kb: KnowledgeBase = knowledge) {
  const l = labels(kb, checkLang(lang));
  return {
    modelVersion: MODEL_VERSION,
    lang,
    areas: kb.areas.map((a) => ({
      id: a.id,
      label: l.area(a.id),
      description: l.areaDescription(a.id),
      children: a.children.map((c) => ({ id: c.id, label: l.sub(c.id), scope: c.scope })),
    })),
    factors: [...kb.factors.values()].map((f) => ({
      id: f.id,
      label: l.factor(f.id),
      group: l.group(f.group),
      description: l.factorDescription(f.id),
      generic: f.fallback,
      alternatives: f.alternatives,
    })),
    examples: kb.examples.map((x) => l.example(x)),
    sources: [...kb.sources.values()].map((s) => ({ ...s, type: l.sourceType(s.type) })),
    limits: LIMITS,
    params: {
      alpha: ALPHA,
      tau: TAU,
      areaTau: AREA_TAU,
      sigmaMax: SIGMA_MAX,
      scopeLevel: SCOPE_LEVEL,
      evidenceWeight: EVIDENCE_WEIGHT,
      overlapDays: OVERLAP_DAYS,
      buildupDays: BUILDUP_DAYS,
    },
  };
}

export type Catalog = ReturnType<typeof catalog>;
