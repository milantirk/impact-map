import {
  ALPHA,
  AREA_TAU,
  BUILDUP_DAYS,
  EVIDENCE_ORDER,
  EVIDENCE_WEIGHT,
  LAGS,
  NEGLIGIBLE,
  OVERLAP_DAYS,
  SCOPE_LEVEL,
  SCOPES,
  SIGMA_MAX,
  TAU,
} from './constants';
import type { Labels } from './knowledge';
import type {
  AreaResult,
  DecisionProfile,
  Evidence,
  FactorInput,
  KnowledgeBase,
  Lag,
  PathStep,
  Scope,
  SubareaResult,
} from './types';

const L = LAGS.length;
const lagIndex = (lag: Lag) => LAGS.indexOf(lag);
const worse = (a: Evidence, b: Evidence): Evidence =>
  EVIDENCE_ORDER.indexOf(a) >= EVIDENCE_ORDER.indexOf(b) ? a : b;

/** People scaling: own effects do not grow; wider circles grow with log10(N) and saturate. */
export function sigma(scope: Scope, people: number): number {
  const level = SCOPE_LEVEL[scope];
  if (level === 0) return 1;
  return Math.min(SIGMA_MAX, (1 + Math.log10(Math.max(1, people))) / (1 + level));
}

/** People whose effects overlap in time, when N people decide within the window. */
export function effectivePeople(people: number, windowDays: number, lag: Lag): number {
  return Math.max(1, people * Math.min(1, OVERLAP_DAYS[lag] / windowDays));
}

/** Share of an effect that has time to build up while the decision is kept. */
export function persistence(durationDays: number | null, lag: Lag): number {
  return durationDays === null ? 1 : Math.min(1, durationDays / BUILDUP_DAYS[lag]);
}

export interface Scenario {
  factors: FactorInput[];
  /** edges from the decision: 1 = direct effects only */
  steps: number;
  people: number;
  windowDays: number;
  durationDays: number | null;
  /** 0..1, precision of the decision model */
  precision: number;
}

/** Per-lag state of one subarea: signed value, absolute mass, confidence-weighted mass. */
export interface LagState {
  v: Float64Array;
  a: Float64Array;
  b: Float64Array;
}

export interface Prepared {
  kb: KnowledgeBase;
  index: Map<string, number>;
  /** scale multiplier m[s * 3 + lag] = persistence(lag) * sigma(scope_s, N_eff(lag)) */
  m: Float64Array;
  links: Array<{
    from: number;
    to: number;
    wc: number;
    c: number;
    lag: number;
    link: KnowledgeBase['links'][number];
  }>;
  outOf: number[][];
}

export function prepare(kb: KnowledgeBase, scenario: Scenario): Prepared {
  const index = new Map(kb.subIds.map((id, i) => [id, i] as const));
  const m = new Float64Array(kb.subIds.length * L);
  kb.subIds.forEach((id, s) => {
    const scope = kb.sub.get(id)!.scope;
    LAGS.forEach((lag, l) => {
      const n = effectivePeople(scenario.people, scenario.windowDays, lag);
      m[s * L + l] = persistence(scenario.durationDays, lag) * sigma(scope, n);
    });
  });
  const links = kb.links.map((link) => ({
    from: index.get(link.from)!,
    to: index.get(link.to)!,
    wc: link.w * EVIDENCE_WEIGHT[link.ev],
    c: EVIDENCE_WEIGHT[link.ev],
    lag: lagIndex(link.lag),
    link,
  }));
  const outOf: number[][] = kb.subIds.map(() => []);
  links.forEach((l, i) => outOf[l.from]!.push(i));
  return { kb, index, m, links, outOf };
}

/** Spread one step: x(k+1) = α · Wᵀ x(k); the lag of a path is its slowest step. */
export function spread(
  p: Prepared,
  state: LagState,
  linkIds: number[],
  into: (to: number, lag: number, v: number, a: number, b: number) => void,
) {
  for (const li of linkIds) {
    const link = p.links[li]!;
    for (let l = 0; l < L; l++) {
      const a = state.a[l]!;
      if (a === 0) continue;
      into(
        link.to,
        Math.max(l, link.lag),
        ALPHA * link.wc * state.v[l]!,
        ALPHA * Math.abs(link.wc) * a,
        ALPHA * Math.abs(link.wc) * link.c * state.b[l]!,
      );
    }
  }
}

export interface ModelResult {
  areas: AreaResult[];
  subareas: Map<string, SubareaResult>;
  net: number;
  profile: DecisionProfile | null;
  /** E per subarea index (for tree coverage) */
  totals: Float64Array;
}

export function computeModel(
  kb: KnowledgeBase,
  scenario: Scenario,
  l: Labels,
  prepared?: Prepared,
): ModelResult {
  const p = prepared ?? prepare(kb, scenario);
  const S = kb.subIds.length;
  const size = S * L;
  const direct = new Float64Array(size);
  let cur: LagState = {
    v: new Float64Array(size),
    a: new Float64Array(size),
    b: new Float64Array(size),
  };

  // 1) direct effect: d = Σ_f i_f · w_fs · c_fs
  for (const f of scenario.factors) {
    for (const e of kb.factors.get(f.id)!.effects) {
      const c = EVIDENCE_WEIGHT[e.ev];
      const v = f.intensity * e.w * c;
      const k = p.index.get(e.target)! * L + lagIndex(e.lag);
      cur.v[k] = cur.v[k]! + v;
      cur.a[k] = cur.a[k]! + Math.abs(v);
      cur.b[k] = cur.b[k]! + Math.abs(v) * c;
    }
  }
  direct.set(cur.v);
  const total: LagState = {
    v: Float64Array.from(cur.v),
    a: Float64Array.from(cur.a),
    b: Float64Array.from(cur.b),
  };

  // 2) spread for steps-1 more steps
  for (let step = 2; step <= scenario.steps; step++) {
    const next: LagState = {
      v: new Float64Array(size),
      a: new Float64Array(size),
      b: new Float64Array(size),
    };
    for (let s = 0; s < S; s++) {
      const view: LagState = {
        v: cur.v.subarray(s * L, s * L + L),
        a: cur.a.subarray(s * L, s * L + L),
        b: cur.b.subarray(s * L, s * L + L),
      };
      spread(p, view, p.outOf[s]!, (to, lag, v, a, b) => {
        const k = to * L + lag;
        next.v[k] = next.v[k]! + v;
        next.a[k] = next.a[k]! + a;
        next.b[k] = next.b[k]! + b;
      });
    }
    for (let k = 0; k < size; k++) {
      total.v[k] = total.v[k]! + next.v[k]!;
      total.a[k] = total.a[k]! + next.a[k]!;
      total.b[k] = total.b[k]! + next.b[k]!;
    }
    cur = next;
  }

  // 3) scale and normalise: E_s = Σ_lag m · x ; h_s = tanh(E_s / τ)
  const paths = strongestPaths(kb, p, scenario, l);
  const subareas = new Map<string, SubareaResult>();
  const deltas = new Map<string, number>();
  let absoluteMass = 0;
  let massByLag = [0, 0, 0];
  let confMass = 0;
  kb.subIds.forEach((id, s) => {
    const sub = kb.sub.get(id)!;
    let value = 0;
    let dir = 0;
    let delta = 0;
    let abs = 0;
    const perLag = [0, 0, 0];
    for (let l2 = 0; l2 < L; l2++) {
      const k = s * L + l2;
      const m = p.m[k]!;
      value += m * total.v[k]!;
      dir += m * direct[k]!;
      delta += m * (total.a[k]! - scenario.precision * total.b[k]!);
      abs += m * total.a[k]!;
      confMass += m * scenario.precision * total.b[k]!;
      perLag[l2] = Math.abs(m * total.v[k]!);
    }
    absoluteMass += abs;
    massByLag = massByLag.map((x, i) => x + perLag[i]!);
    const lagSum = perLag[0]! + perLag[1]! + perLag[2]!;
    const score = Math.tanh(value / TAU);
    const range: [number, number] = [
      Math.tanh((value - delta) / TAU),
      Math.tanh((value + delta) / TAU),
    ];
    const path = paths.get(id);
    subareas.set(id, {
      id,
      label: l.sub(id),
      area: sub.parent,
      areaLabel: l.area(sub.parent),
      scope: sub.scope,
      score,
      range,
      uncertain:
        Math.abs(score) >= NEGLIGIBLE && ((range[0] < 0 && range[1] > 0) || path?.evidence === 'D'),
      value,
      direct: dir,
      indirect: value - dir,
      lagMix: {
        short: lagSum ? perLag[0]! / lagSum : 0,
        mid: lagSum ? perLag[1]! / lagSum : 0,
        long: lagSum ? perLag[2]! / lagSum : 0,
      },
      path: path?.steps ?? [],
      evidence: path?.evidence ?? null,
      confidence: path?.confidence ?? 0,
      lag: path?.lag ?? null,
      sources: path?.sources ?? [],
    });
    deltas.set(id, delta);
  });

  const areas: AreaResult[] = kb.areas.map((a) => {
    const children = a.children.map((c) => subareas.get(c.id)!);
    const value = children.reduce((sum, c) => sum + c.value, 0);
    const delta = a.children.reduce((sum, c) => sum + deltas.get(c.id)!, 0);
    const score = Math.tanh(value / AREA_TAU);
    const range: [number, number] = [
      Math.tanh((value - delta) / AREA_TAU),
      Math.tanh((value + delta) / AREA_TAU),
    ];
    return {
      id: a.id,
      label: l.area(a.id),
      score,
      range,
      uncertain: Math.abs(score) >= NEGLIGIBLE && range[0] < 0 && range[1] > 0,
      value,
      magnitude: children.reduce((sum, c) => sum + Math.abs(c.value), 0),
      children: [...children].sort((x, y) => Math.abs(y.score) - Math.abs(x.score)),
    };
  });
  const net = areas.reduce((sum, a) => sum + a.score, 0) / areas.length;
  const profile = profileOf(areas, subareas, massByLag, absoluteMass ? confMass / absoluteMass : 0);
  const totals = Float64Array.from(kb.subIds, (id) => subareas.get(id)!.value);
  return { areas, subareas, net, profile, totals };
}

interface BestPath {
  steps: PathStep[];
  evidence: Evidence;
  confidence: number;
  lag: Lag;
  sources: string[];
}

/** Strongest path (largest Π|w|) to every subarea within the step limit. */
export function strongestPaths(
  kb: KnowledgeBase,
  p: Prepared,
  scenario: Scenario,
  l: Labels,
): Map<string, BestPath> {
  interface Cell {
    strength: number;
    step: Omit<PathStep, 'fromLabel' | 'toLabel'>;
    prev: number | null;
  }
  const S = kb.subIds.length;
  const layers: Array<Array<Cell | null>> = [];
  const first: Array<Cell | null> = new Array(S).fill(null);
  for (const f of scenario.factors) {
    for (const e of kb.factors.get(f.id)!.effects) {
      const v = f.intensity * e.w * EVIDENCE_WEIGHT[e.ev];
      const t = p.index.get(e.target)!;
      if (v !== 0 && Math.abs(v) > (first[t]?.strength ?? 0)) {
        first[t] = {
          strength: Math.abs(v),
          prev: null,
          step: { from: 'f:' + f.id, to: e.target, w: v, ev: e.ev, lag: e.lag, src: e.src },
        };
      }
    }
  }
  layers.push(first);
  for (let k = 1; k < scenario.steps; k++) {
    const prevLayer = layers[k - 1]!;
    const layer: Array<Cell | null> = new Array(S).fill(null);
    for (let s = 0; s < S; s++) {
      const cell = prevLayer[s];
      if (!cell) continue;
      for (const li of p.outOf[s]!) {
        const link = p.links[li]!;
        const w = ALPHA * link.wc;
        const strength = cell.strength * Math.abs(w);
        if (w !== 0 && strength > (layer[link.to]?.strength ?? 0)) {
          layer[link.to] = {
            strength,
            prev: s,
            step: {
              from: link.link.from,
              to: link.link.to,
              w,
              ev: link.link.ev,
              lag: link.link.lag,
              src: link.link.src,
            },
          };
        }
      }
    }
    layers.push(layer);
  }

  const result = new Map<string, BestPath>();
  kb.subIds.forEach((id, t) => {
    let bestK = -1;
    for (let k = 0; k < layers.length; k++) {
      const cell = layers[k]![t];
      if (cell && cell.strength > (bestK < 0 ? 0 : layers[bestK]![t]!.strength)) bestK = k;
    }
    if (bestK < 0) return;
    const steps: PathStep[] = [];
    let node: number | null = t;
    for (let k = bestK; k >= 0 && node !== null; k--) {
      const cell: Cell = layers[k]![node]!;
      steps.unshift({
        ...cell.step,
        fromLabel: nodeLabel(cell.step.from, l),
        toLabel: l.sub(cell.step.to),
      });
      node = cell.prev;
    }
    const sources: string[] = [];
    for (const st of steps) for (const s of st.src) if (!sources.includes(s)) sources.push(s);
    result.set(id, {
      steps,
      evidence: steps.reduce<Evidence>((acc, st) => worse(acc, st.ev), 'A'),
      confidence: steps.reduce((acc, st) => acc * EVIDENCE_WEIGHT[st.ev], 1),
      lag: steps.reduce<Lag>(
        (acc, st) => (lagIndex(st.lag) > lagIndex(acc) ? st.lag : acc),
        'short',
      ),
      sources,
    });
  });
  return result;
}

const nodeLabel = (node: string, l: Labels) =>
  node.startsWith('f:') ? l.factor(node.slice(2)) : l.sub(node);

/** Thresholds for the magnitude category: total |E| of the decision. */
export const MAGNITUDE_LIMITS = { medium: 1.0, large: 2.5 } as const;
/** Thresholds for the certainty category: mean of path confidence × precision. */
export const CERTAINTY_LIMITS = { medium: 0.25, high: 0.45 } as const;
/** A circle counts as reached when it gets at least this share of the impact. */
export const REACH_SHARE = 0.1;

/** Decision categories, derived from the result (not chosen beforehand). */
function profileOf(
  areas: AreaResult[],
  subareas: Map<string, SubareaResult>,
  massByLag: number[],
  certainty: number,
): DecisionProfile | null {
  const total = areas.reduce((sum, a) => sum + a.magnitude, 0);
  if (total < 1e-9) return null;
  const ranked = [...areas].sort((a, b) => b.magnitude - a.magnitude);
  const domains = ranked
    .filter((a, i) => i === 0 || (i === 1 && a.magnitude / total >= 0.2))
    .map((a) => ({ id: a.id, label: a.label, share: a.magnitude / total }));
  const byScope = Object.fromEntries(SCOPES.map((s) => [s, 0])) as Record<Scope, number>;
  let positive = 0;
  for (const s of subareas.values()) {
    byScope[s.scope] += Math.abs(s.value);
    if (s.value > 0) positive += s.value;
  }
  const reach =
    [...SCOPES].reverse().find((s) => byScope[s] / total >= REACH_SHARE) ?? 'individual';
  const horizon = LAGS[massByLag.indexOf(Math.max(...massByLag))] ?? 'mid';
  return {
    domains,
    reach,
    horizon,
    magnitude:
      total >= MAGNITUDE_LIMITS.large
        ? 'large'
        : total >= MAGNITUDE_LIMITS.medium
          ? 'medium'
          : 'small',
    certainty:
      certainty >= CERTAINTY_LIMITS.high
        ? 'high'
        : certainty >= CERTAINTY_LIMITS.medium
          ? 'medium'
          : 'low',
    positiveShare: positive / total,
  };
}
