import { describe, expect, it } from 'vitest';
import {
  analyze,
  effectivePeople,
  knowledge,
  LIMITS,
  persistence,
  scoreDeltas,
  sigma,
} from '../src';
import { subareasOf, walk } from './helpers';

const gym = 'Hetente háromszor edzek az edzőteremben, mert túlsúlyos lettem egy sérülés miatt.';
const car = 'Autót veszek.';

describe('general equation', () => {
  it('counts only direct effects with one step', () => {
    const map = analyze({ text: car, steps: 1 });
    for (const sub of subareasOf(map).values()) expect(sub.indirect).toBeCloseTo(0, 12);
  });

  it('adds indirect effects with more steps', () => {
    const one = subareasOf(analyze({ text: car, steps: 1 }));
    const three = subareasOf(analyze({ text: car, steps: 3 }));
    const reachedLater = [...three.values()].filter(
      (s) => s.value !== 0 && one.get(s.id)!.value === 0,
    );
    expect(reachedLater.length).toBeGreaterThan(0);
  });

  it('keeps every score inside its uncertainty range', () => {
    const map = analyze({ text: gym, steps: 5, people: 5000 });
    for (const s of subareasOf(map).values()) {
      expect(s.range[0]).toBeLessThanOrEqual(s.score + 1e-12);
      expect(s.range[1]).toBeGreaterThanOrEqual(s.score - 1e-12);
      expect(Math.abs(s.score)).toBeLessThanOrEqual(1);
    }
    for (const a of map.areas) expect(a.range[0]).toBeLessThanOrEqual(a.score + 1e-12);
  });

  it('net is the mean of the main area scores', () => {
    const map = analyze({ text: gym });
    const mean = map.areas.reduce((s, a) => s + a.score, 0) / map.areas.length;
    expect(map.net).toBeCloseTo(mean, 12);
  });

  it('gives the same result for the same input', () => {
    expect(JSON.stringify(analyze({ text: gym, steps: 4 }))).toBe(
      JSON.stringify(analyze({ text: gym, steps: 4 })),
    );
  });

  it('keeps the strongest path inside the step limit', () => {
    for (const steps of [1, 2, 4]) {
      for (const s of subareasOf(analyze({ text: gym, steps })).values()) {
        expect(s.path.length).toBeLessThanOrEqual(steps);
        if (s.path.length) expect(s.path[0]!.from.startsWith('f:')).toBe(true);
      }
    }
  });
});

describe('people and time window', () => {
  it('does not scale own effects, but scales wider circles', () => {
    expect(sigma('individual', 1e9)).toBe(1);
    expect(sigma('society', 1)).toBeLessThan(sigma('society', 1e5));
    expect(sigma('global', 1e12)).toBe(1.5);
    const one = subareasOf(analyze({ text: car }));
    const many = subareasOf(analyze({ text: car, people: 1_000_000 }));
    expect(many.get('fin.cashflow')!.value).toBeCloseTo(one.get('fin.cashflow')!.value, 12);
    expect(Math.abs(many.get('env.climate')!.value)).toBeGreaterThan(
      Math.abs(one.get('env.climate')!.value),
    );
  });

  it('spreads short effects when people decide over a longer window', () => {
    expect(effectivePeople(1000, 3650, 'short')).toBeCloseTo(100, 9);
    expect(effectivePeople(1000, 3650, 'long')).toBe(1000);
    expect(effectivePeople(1, 3650, 'short')).toBe(1);
    const fast = subareasOf(analyze({ text: car, people: 100_000, windowDays: 30 }));
    const slow = subareasOf(analyze({ text: car, people: 100_000, windowDays: 3650 }));
    expect(Math.abs(slow.get('env.air')!.value)).toBeLessThan(Math.abs(fast.get('env.air')!.value));
    expect(slow.get('fin.cashflow')!.value).toBeCloseTo(fast.get('fin.cashflow')!.value, 12);
  });

  it('shows the change against one person', () => {
    const base = analyze({ text: car });
    const deltas = scoreDeltas(base, analyze({ text: car, people: 1_000_000 }));
    expect(deltas['fin.cashflow']).toBeCloseTo(0, 12);
    expect(Math.abs(deltas['env.climate']!)).toBeGreaterThan(0.05);
  });
});

describe('duration', () => {
  it('reduces slow effects of a short decision', () => {
    expect(persistence(null, 'long')).toBe(1);
    expect(persistence(365, 'short')).toBe(1);
    expect(persistence(365, 'long')).toBeLessThan(persistence(365, 'mid'));
    const kept = subareasOf(analyze({ text: 'Minden nap sportolok.' }));
    const month = subareasOf(analyze({ text: 'Minden nap sportolok egy hónapig.' }));
    expect(month.get('health.longevity')!.value).toBeLessThan(
      kept.get('health.longevity')!.value / 5,
    );
  });

  it('lets an explicit duration override the text', () => {
    const map = analyze({ text: 'Minden nap sportolok egy hónapig.', durationDays: null });
    expect(map.params.durationDays).toBeNull();
    expect(map.interpretation.durationDays).toBe(30);
  });
});

describe('precision', () => {
  it('narrows the uncertainty range when the decision model has more detail', () => {
    const vague = subareasOf(analyze({ text: 'Edzeni fogok.' }));
    const precise = subareasOf(
      analyze({
        text: 'Edzeni fogok hetente háromszor, mert jobban akarok lenni, otthon, a családommal.',
      }),
    );
    const width = (s: { range: [number, number] }) => s.range[1] - s.range[0];
    expect(width(precise.get('health.physical')!)).toBeLessThan(
      width(vague.get('health.physical')!),
    );
  });
});

describe('impact tree', () => {
  it('adds up exactly to the table values without pruning', () => {
    const map = analyze({
      text: car,
      steps: 3,
      tree: { minValue: 0, maxNodes: LIMITS.tree.maxNodesLimit },
    });
    const sums = new Map<string, number>();
    walk(map.tree!, (n) => {
      if (n.depth > 0) sums.set(n.subarea, (sums.get(n.subarea) ?? 0) + n.value);
    });
    for (const s of subareasOf(map).values()) expect(sums.get(s.id) ?? 0).toBeCloseTo(s.value, 10);
    expect(map.treeStats!.coverage).toBeCloseTo(1, 10);
    expect(map.treeStats!.truncated).toBe(false);
  });

  it('respects depth, node limit and stable ids', () => {
    const map = analyze({ text: gym, steps: 4, tree: { maxNodes: 25 } });
    let count = 0;
    walk(map.tree!, (n) => {
      expect(n.depth).toBeLessThanOrEqual(4);
      if (n.depth > 0) {
        count += 1;
        expect(n.id.split('>').length).toBe(n.depth + 1);
        expect(n.id.endsWith(n.subarea)).toBe(true);
      }
    });
    expect(count).toBe(25);
    expect(map.treeStats!.truncated).toBe(true);
    const again = analyze({ text: gym, steps: 4, tree: { maxNodes: 25 } });
    expect(JSON.stringify(again.tree)).toBe(JSON.stringify(map.tree));
  });

  it('lists the factors behind a direct node', () => {
    const map = analyze({ text: gym });
    const physical = map.tree!.children.find((c) => c.subarea === 'health.physical')!;
    expect(physical.drivers.map((d) => d.factorId)).toContain('regular_exercise');
    expect(physical.via).toBeNull();
  });
});

describe('decision categories (derived from the result)', () => {
  it('describes a health decision', () => {
    const p = analyze({ text: gym }).profile!;
    expect(p.domains[0]!.id).toBe('health');
    expect(['individual', 'community', 'society', 'global']).toContain(p.reach);
    expect(p.positiveShare).toBeGreaterThan(0.5);
  });

  it('reaches the global circle for a car', () => {
    expect(['society', 'global']).toContain(
      analyze({ text: car, people: 1_000_000 }).profile!.reach,
    );
  });

  it('is empty without factors', () => {
    const map = analyze({ text: '' });
    expect(map.profile).toBeNull();
    expect(map.tree).toBeNull();
    expect(map.net).toBe(0);
  });
});

describe('knowledge coverage of the equation', () => {
  it('every factor gives a non-zero impact', () => {
    for (const id of knowledge.factors.keys()) {
      const map = analyze({ factors: [{ id, intensity: 1 }], tree: false });
      expect(
        map.areas.some((a) => a.magnitude > 0),
        id,
      ).toBe(true);
    }
  });
});
