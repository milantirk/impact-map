import { describe, expect, it } from 'vitest';
import {
  analyze,
  buildKnowledge,
  catalog,
  InputError,
  knowledge,
  labels,
  rawKnowledge,
} from '../src';

describe('knowledge base', () => {
  it('has the expected shape', () => {
    expect(knowledge.areas).toHaveLength(8);
    expect(knowledge.subIds).toHaveLength(36);
    expect(knowledge.factors.size).toBeGreaterThanOrEqual(240);
    expect(knowledge.generic.length).toBeGreaterThan(0);
    for (const f of knowledge.factors.values()) expect(f.effects.length, f.id).toBeGreaterThan(0);
  });

  it('rejects broken references', () => {
    const broken = structuredClone({ ...rawKnowledge, overlays: {} });
    broken.links = [...broken.links, broken.links[0]!];
    broken.factorFiles['99_test'] = [
      { id: 'x', label: 'x', patterns: ['('], fx: [['nope.nope', 2, 'Z' as never]] },
    ];
    expect(() => buildKnowledge(broken)).toThrowError(/duplicate link/);
    expect(() => buildKnowledge(broken)).toThrowError(/bad pattern/);
  });

  it('covers every id in the English overlay', () => {
    const en = knowledge.overlays.en!;
    expect(Object.keys(en.areas).sort()).toEqual(knowledge.areas.map((a) => a.id).sort());
    expect(Object.keys(en.subareas).sort()).toEqual([...knowledge.subIds].sort());
    expect(Object.keys(en.factors).sort()).toEqual([...knowledge.factors.keys()].sort());
    const groups = new Set([...knowledge.factors.values()].map((f) => f.group));
    for (const g of groups) expect(en.groups[g], g).toBeTruthy();
    for (const s of knowledge.sources.values()) expect(en.sourceTypes[s.type], s.type).toBeTruthy();
    for (const x of knowledge.examples) expect(en.examples[x.id]?.text, x.id).toBeTruthy();
  });

  it('falls back to Hungarian labels', () => {
    const l = labels({ ...knowledge, overlays: {} }, 'en');
    expect(l.area('health')).toBe('Egészségügyi');
    expect(l.sub('unknown.id')).toBe('unknown.id');
  });

  it('builds a catalog for clients', () => {
    const c = catalog('en');
    expect(c.areas).toHaveLength(8);
    expect(c.factors.length).toBe(knowledge.factors.size);
    expect(c.examples.length).toBe(knowledge.examples.length);
    expect(c.params.alpha).toBe(0.6);
  });
});

describe('input checks', () => {
  it.each([
    [{ lang: 'de' }],
    [{ text: 42 }],
    [{ steps: Number.NaN }],
    [{ factors: 'buy_car' }],
    [{ factors: [{ id: 'nope', intensity: 1 }] }],
    [{ factors: Array.from({ length: 21 }, (_, i) => ({ id: `f${i}`, intensity: 1 })) }],
    [{ factors: [{ id: 'buy_car', intensity: 'max' }] }],
    [{ text: 'Autót veszek.', tree: { maxNodes: 'all' } }],
    [{ text: 'Autót veszek.', tree: { minValue: Number.NaN } }],
  ])('rejects %j', (input) => {
    expect(() => analyze(input as never)).toThrow(InputError);
  });

  it('clamps numbers into their limits', () => {
    const map = analyze({
      text: 'Autót veszek.',
      steps: 99,
      people: 0,
      windowDays: 10 ** 9,
      durationDays: -5,
    });
    expect(map.params).toMatchObject({ steps: 7, people: 1, windowDays: 36_500, durationDays: 1 });
    const f = analyze({
      factors: [
        { id: 'buy_car', intensity: 7 },
        { id: 'buy_car', intensity: 0.2 },
      ],
    }).factors;
    expect(f).toEqual([expect.objectContaining({ id: 'buy_car', intensity: 1 })]);
  });

  it('uses intensity 1 when it is missing', () => {
    expect(analyze({ factors: [{ id: 'buy_car' }] }).factors[0]!.intensity).toBe(1);
  });

  it('can skip the tree', () => {
    expect(analyze({ text: 'Autót veszek.', tree: false }).tree).toBeNull();
  });
});
