import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { analyze, interpret } from '../src';
import { FIXTURE_DIR, loadFixtureKnowledge, subareasOf } from './helpers';

interface GoldenCase {
  factors: Array<{ id: string; intensity: number }>;
  scale: number;
  value: Record<string, number>;
  direct: Record<string, number>;
  areas: Record<string, number>;
  net: number;
}
interface GoldenParse {
  text: string;
  factors: Array<{ id: string; intensity: number }>;
  negated: string[];
}
const golden = JSON.parse(readFileSync(join(FIXTURE_DIR, 'golden.json'), 'utf8')) as {
  cases: GoldenCase[];
  parses: GoldenParse[];
};
const kb = loadFixtureKnowledge();
const TOLERANCE = 1e-9;

/**
 * The general equation reduces to the Python prototype when the time window is at most one year,
 * no duration is given and the spread runs for 6 steps (7 edges from the decision).
 */
describe('parity with the Python prototype', () => {
  it('has reference data', () => {
    expect(golden.cases.length).toBeGreaterThan(280);
    expect(golden.parses.length).toBeGreaterThan(200);
  });

  it.each(golden.cases.map((c, i) => [i, c] as const))('equation case %i', (_i, c) => {
    const map = analyze(
      {
        factors: c.factors,
        people: c.scale,
        steps: 7,
        windowDays: 365,
        durationDays: null,
        tree: false,
      },
      kb,
    );
    for (const [id, sub] of subareasOf(map)) {
      expect(sub.value).toBeCloseTo(c.value[id] ?? 0, 9);
      expect(Math.abs(sub.direct - (c.direct[id] ?? 0))).toBeLessThan(TOLERANCE);
    }
    for (const area of map.areas)
      expect(Math.abs(area.score - c.areas[area.id]!)).toBeLessThan(TOLERANCE);
    expect(Math.abs(map.net - c.net)).toBeLessThan(TOLERANCE);
  });

  it('reads the same factors, intensities and negations from text', () => {
    const mismatches = golden.parses.filter((g) => {
      const r = interpret(g.text, 'hu', kb);
      const same =
        JSON.stringify(r.factors.map((f) => [f.id, f.intensity])) ===
          JSON.stringify(g.factors.map((f) => [f.id, f.intensity])) &&
        JSON.stringify(r.negated.map((n) => n.id)) === JSON.stringify(g.negated);
      return !same;
    });
    expect(mismatches.map((m) => m.text)).toEqual([]);
  });
});
