import { ALPHA, EVIDENCE_ORDER, EVIDENCE_WEIGHT, LAGS, LIMITS, TAU } from './constants';
import type { Labels } from './knowledge';
import { spread, type LagState, type Prepared, type Scenario } from './model';
import type { Driver, Evidence, ImpactNode, KnowledgeBase, TreeStats } from './types';

export interface TreeOptions {
  /** drop paths weaker than this (scaled or raw) */
  minValue: number;
  /** keep at most this many nodes (the strongest ones) */
  maxNodes: number;
}

export const DEFAULT_TREE: TreeOptions = {
  minValue: LIMITS.tree.minValue,
  maxNodes: LIMITS.tree.maxNodes,
};

const L = LAGS.length;
const worse = (a: Evidence, b: Evidence): Evidence =>
  EVIDENCE_ORDER.indexOf(a) >= EVIDENCE_ORDER.indexOf(b) ? a : b;

interface Candidate extends LagState {
  id: string;
  parent: ImpactNode;
  depth: number;
  s: number;
  evidence: Evidence;
  via: ImpactNode['via'];
  drivers: Driver[];
  priority: number;
  order: number;
}

/** Max-heap by priority; equal priorities keep insertion order, so the result is stable. */
class Heap {
  private items: Candidate[] = [];
  get size() {
    return this.items.length;
  }
  private before(x: Candidate, y: Candidate) {
    return x.priority > y.priority || (x.priority === y.priority && x.order < y.order);
  }
  push(c: Candidate) {
    const a = this.items;
    a.push(c);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (!this.before(a[i]!, a[parent]!)) break;
      [a[i], a[parent]] = [a[parent]!, a[i]!];
      i = parent;
    }
  }
  pop(): Candidate | undefined {
    const a = this.items;
    const top = a[0];
    const last = a.pop();
    if (a.length > 0 && last) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let best = i;
        if (left < a.length && this.before(a[left]!, a[best]!)) best = left;
        if (right < a.length && this.before(a[right]!, a[best]!)) best = right;
        if (best === i) break;
        [a[i], a[best]] = [a[best]!, a[i]!];
        i = best;
      }
    }
    return top;
  }
}

/**
 * Impact tree: every node is one path from the decision (walk unfolding of the spread).
 * With minValue = 0 and no node limit, the nodes of a subarea add up to its E value.
 */
export function buildTree(
  kb: KnowledgeBase,
  p: Prepared,
  scenario: Scenario,
  l: Labels,
  options: TreeOptions,
  rootLabel: string,
  totals: Float64Array,
): { tree: ImpactNode; stats: TreeStats } {
  const root: ImpactNode = {
    id: 'root',
    depth: 0,
    subarea: 'decision',
    area: 'decision',
    label: rootLabel,
    areaLabel: '',
    value: 0,
    score: 0,
    confidence: 1,
    evidence: null,
    lag: null,
    uncertain: false,
    via: null,
    drivers: [],
    children: [],
  };
  const heap = new Heap();
  let order = 0;
  const scaled = (s: number, v: Float64Array) => {
    let sum = 0;
    for (let k = 0; k < L; k++) sum += p.m[s * L + k]! * v[k]!;
    return sum;
  };
  const push = (c: Omit<Candidate, 'priority' | 'order'>) => {
    const raw = c.v[0]! + c.v[1]! + c.v[2]!;
    heap.push({
      ...c,
      priority: Math.max(Math.abs(scaled(c.s, c.v)), Math.abs(raw)),
      order: order++,
    });
  };

  // depth 1: direct effects, summed over the factors
  const direct = new Map<
    number,
    LagState & { drivers: Map<string, number>; best: { v: number; ev: Evidence } }
  >();
  for (const f of scenario.factors) {
    for (const e of kb.factors.get(f.id)!.effects) {
      const s = p.index.get(e.target)!;
      const lag = LAGS.indexOf(e.lag);
      const c = EVIDENCE_WEIGHT[e.ev];
      const v = f.intensity * e.w * c;
      let cell = direct.get(s);
      if (!cell) {
        cell = {
          v: new Float64Array(L),
          a: new Float64Array(L),
          b: new Float64Array(L),
          drivers: new Map(),
          best: { v: 0, ev: e.ev },
        };
        direct.set(s, cell);
      }
      cell.v[lag] = cell.v[lag]! + v;
      cell.a[lag] = cell.a[lag]! + Math.abs(v);
      cell.b[lag] = cell.b[lag]! + Math.abs(v) * c;
      cell.drivers.set(f.id, (cell.drivers.get(f.id) ?? 0) + p.m[s * L + lag]! * v);
      if (Math.abs(v) > Math.abs(cell.best.v)) cell.best = { v, ev: e.ev };
    }
  }
  for (const [s, cell] of [...direct.entries()].sort((x, y) => x[0] - y[0])) {
    push({
      id: `root>${kb.subIds[s]}`,
      parent: root,
      depth: 1,
      s,
      v: cell.v,
      a: cell.a,
      b: cell.b,
      evidence: cell.best.ev,
      via: null,
      drivers: [...cell.drivers.entries()]
        .map(([factorId, value]) => ({ factorId, label: l.factor(factorId), value }))
        .sort((x, y) => Math.abs(y.value) - Math.abs(x.value)),
    });
  }

  let count = 0;
  let truncated = false;
  const shown = new Float64Array(totals.length);
  while (heap.size > 0) {
    const c = heap.pop()!;
    if (c.priority < options.minValue) break;
    if (count >= options.maxNodes) {
      truncated = true;
      break;
    }
    count += 1;
    const subId = kb.subIds[c.s]!;
    const sub = kb.sub.get(subId)!;
    const value = scaled(c.s, c.v);
    let mass = 0;
    let conf = 0;
    let lagBest = 0;
    for (let k = 0; k < L; k++) {
      const m = p.m[c.s * L + k]!;
      mass += m * c.a[k]!;
      conf += m * c.b[k]!;
      if (Math.abs(m * c.v[k]!) > Math.abs(p.m[c.s * L + lagBest]! * c.v[lagBest]!)) lagBest = k;
    }
    shown[c.s] = shown[c.s]! + value;
    const node: ImpactNode = {
      id: c.id,
      depth: c.depth,
      subarea: subId,
      area: sub.parent,
      label: l.sub(subId),
      areaLabel: l.area(sub.parent),
      value,
      score: Math.tanh(value / TAU),
      confidence: mass > 0 ? conf / mass : 0,
      evidence: c.evidence,
      lag: LAGS[lagBest]!,
      uncertain: c.evidence === 'D',
      via: c.via,
      drivers: c.drivers,
      children: [],
    };
    c.parent.children.push(node);
    if (c.depth >= scenario.steps) continue;
    for (const li of p.outOf[c.s]!) {
      const link = p.links[li]!;
      const child: LagState = {
        v: new Float64Array(L),
        a: new Float64Array(L),
        b: new Float64Array(L),
      };
      spread(p, c, [li], (_to, lag, v, a, b) => {
        child.v[lag] = child.v[lag]! + v;
        child.a[lag] = child.a[lag]! + a;
        child.b[lag] = child.b[lag]! + b;
      });
      push({
        ...child,
        id: `${c.id}>${link.link.to}`,
        parent: node,
        depth: c.depth + 1,
        s: link.to,
        evidence: worse(c.evidence, link.link.ev),
        via: { w: ALPHA * link.wc, ev: link.link.ev, lag: link.link.lag, src: link.link.src },
        drivers: [],
      });
    }
  }

  const sortChildren = (node: ImpactNode) => {
    node.children.sort((x, y) => p.index.get(x.subarea)! - p.index.get(y.subarea)!);
    node.children.forEach(sortChildren);
  };
  sortChildren(root);
  let missing = 0;
  let whole = 0;
  totals.forEach((e, s) => {
    missing += Math.abs(e - shown[s]!);
    whole += Math.abs(e);
  });
  return {
    tree: root,
    stats: { nodes: count, truncated, coverage: whole > 0 ? Math.max(0, 1 - missing / whole) : 1 },
  };
}
