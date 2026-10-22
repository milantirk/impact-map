export type Lang = 'hu' | 'en';
/** Evidence grade of a causal link. A = strongest, D = model assumption. */
export type Evidence = 'A' | 'B' | 'C' | 'D';
/** When an effect shows: short < 1 year, mid 1–5 years, long > 5 years. */
export type Lag = 'short' | 'mid' | 'long';
/** Who feels the effect. */
export type Scope = 'individual' | 'community' | 'society' | 'global';

export interface Subarea {
  id: string;
  label: string;
  scope: Scope;
  /** main area id */
  parent: string;
}

export interface Area {
  id: string;
  label: string;
  description: string;
  children: Subarea[];
}

/** Direct effect of a decision factor on a subarea. */
export interface Effect {
  target: string;
  /** signed weight, -1..1. Positive = the subarea gets better. */
  w: number;
  ev: Evidence;
  lag: Lag;
  src: string[];
}

/** Causal link from one subarea to another. */
export interface Link {
  from: string;
  to: string;
  w: number;
  ev: Evidence;
  lag: Lag;
  src: string[];
}

export interface Factor {
  id: string;
  label: string;
  /** topic tag for browsing; it is not part of the math */
  group: string;
  description: string;
  patterns: RegExp[];
  excludes: string[];
  ifNegated?: string;
  alternatives: string[];
  /** generic factor: counts only when a sentence has no concrete factor */
  fallback: boolean;
  effects: Effect[];
}

export interface Source {
  id: string;
  authors: string;
  year: number | null;
  title: string;
  venue: string;
  type: string;
}

export interface Example {
  id: string;
  title: string;
  text: string;
}

export interface Overlay {
  areas: Record<string, { label: string; description?: string }>;
  subareas: Record<string, string>;
  factors: Record<string, { label: string; description?: string; keywords?: string[] }>;
  groups: Record<string, string>;
  sourceTypes: Record<string, string>;
  examples: Record<string, { title: string; text: string }>;
}

export interface KnowledgeBase {
  areas: Area[];
  sub: Map<string, Subarea>;
  /** subarea ids in a fixed order (area order, then file order) */
  subIds: string[];
  factors: Map<string, Factor>;
  specific: string[];
  generic: string[];
  links: Link[];
  out: Map<string, Link[]>;
  sources: Map<string, Source>;
  examples: Example[];
  overlays: Partial<Record<Lang, Overlay>>;
}

export interface FactorInput {
  id: string;
  /** 0.05..1 (1 = daily / fully) */
  intensity: number;
}

export type FacetId =
  | 'frequency'
  | 'duration'
  | 'reason'
  | 'amount'
  | 'quantity'
  | 'place'
  | 'people'
  | 'financing'
  | 'condition'
  | 'start';

export interface ParsedFactor extends FactorInput {
  label: string;
  group: string;
  /** the text part that matched */
  match: string;
  generic: boolean;
}

export interface Interpretation {
  factors: ParsedFactor[];
  negated: Array<{ id: string; label: string }>;
  /** details the text gives */
  facets: FacetId[];
  /** the most useful details that are missing, best first (max 3) */
  missing: FacetId[];
  /** 0..1: how well the decision model is specified (not forecast accuracy) */
  precision: number;
  /** decision duration found in the text; null = not given (sustained) */
  durationDays: number | null;
  words: number;
}

export interface PathStep {
  /** "f:<factorId>" for the first step, else a subarea id */
  from: string;
  to: string;
  /** effective step weight (with evidence and damping) */
  w: number;
  ev: Evidence;
  lag: Lag;
  src: string[];
  fromLabel: string;
  toLabel: string;
}

export interface SubareaResult {
  id: string;
  label: string;
  area: string;
  areaLabel: string;
  scope: Scope;
  /** impact degree ("hatásfok"): tanh(E / TAU), -1..1 */
  score: number;
  /** uncertainty range of the score */
  range: [number, number];
  /** the range includes 0, or the main path is a model assumption */
  uncertain: boolean;
  /** E: the scaled effect */
  value: number;
  direct: number;
  indirect: number;
  /** share of |E| by lag */
  lagMix: Record<Lag, number>;
  /** strongest path within the step limit */
  path: PathStep[];
  evidence: Evidence | null;
  confidence: number;
  lag: Lag | null;
  sources: string[];
}

export interface AreaResult {
  id: string;
  label: string;
  score: number;
  range: [number, number];
  uncertain: boolean;
  value: number;
  /** sum of |E| of the children */
  magnitude: number;
  children: SubareaResult[];
}

export interface DecisionProfile {
  /** main areas with the largest share of the impact (1–2) */
  domains: Array<{ id: string; label: string; share: number }>;
  /** the widest circle that gets at least 10 % of the impact */
  reach: Scope;
  /** lag with the largest share of the impact */
  horizon: Lag;
  /** size of the total impact */
  magnitude: 'small' | 'medium' | 'large';
  certainty: 'low' | 'medium' | 'high';
  /** how much of the impact is positive, 0..1 */
  positiveShare: number;
}

export interface Driver {
  factorId: string;
  label: string;
  /** scaled contribution */
  value: number;
}

export interface ImpactNode {
  /** path id, stable between runs: "root>health.physical>health.longevity" */
  id: string;
  depth: number;
  /** subarea id, or "decision" for the root */
  subarea: string;
  area: string;
  label: string;
  areaLabel: string;
  /** scaled contribution of this path */
  value: number;
  /** tanh(value / TAU) */
  score: number;
  /** mean path confidence, weighted by |contribution| */
  confidence: number;
  /** weakest evidence on the path */
  evidence: Evidence | null;
  /** lag with the largest part of this contribution */
  lag: Lag | null;
  /** the main path step is a model assumption (D) */
  uncertain: boolean;
  /** the link into this node (depth >= 2) */
  via: { w: number; ev: Evidence; lag: Lag; src: string[] } | null;
  /** factors behind a direct node (depth 1) */
  drivers: Driver[];
  children: ImpactNode[];
}

export interface TreeStats {
  nodes: number;
  /** weak branches were dropped to keep the graph readable */
  truncated: boolean;
  /** share of the table values that the visible nodes explain, 0..1 */
  coverage: number;
}

export interface ScenarioParams {
  steps: number;
  people: number;
  windowDays: number;
  durationDays: number | null;
  precision: number;
  /** people whose effects overlap, per lag (time window effect) */
  effectivePeople: Record<Lag, number>;
  /** share of the effect that has time to show, per lag (duration effect) */
  persistence: Record<Lag, number>;
}

export interface ImpactMap {
  modelVersion: string;
  lang: Lang;
  interpretation: Interpretation;
  factors: Array<FactorInput & { label: string; group: string }>;
  params: ScenarioParams;
  areas: AreaResult[];
  /** mean impact degree of the main areas (equal weight), -1..1 */
  net: number;
  profile: DecisionProfile | null;
  tree: ImpactNode | null;
  treeStats: TreeStats | null;
}

export class InputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InputError';
  }
}
