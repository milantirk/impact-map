import { interpret } from '@impact-map/engine';
import { describe, expect, it } from 'vitest';
import { peopleFromSlider, signed, sliderFromPeople, tone } from '../src/format';
import {
  DEFAULT_SETTINGS,
  durationDays,
  effectiveFactors,
  overridesFor,
  runAnalysis,
} from '../src/state';

describe('format', () => {
  it('formats signed numbers per language', () => {
    expect(signed(0.4213, 'en')).toBe('+0.42');
    expect(signed(-0.4213, 'hu')).toBe('-0,42');
    expect(signed(0.0004, 'en')).toBe('0.00');
  });

  it('maps the people slider on a log scale both ways', () => {
    expect(peopleFromSlider(0)).toBe(1);
    expect(peopleFromSlider(4)).toBe(10_000);
    expect(peopleFromSlider(4.5)).toBe(30_000);
    expect(peopleFromSlider(9)).toBe(1_000_000_000);
    expect(sliderFromPeople(10_000)).toBe(4);
    expect(sliderFromPeople(31_000)).toBe(4.5);
  });

  it('gives a colour role to every value', () => {
    expect(tone(0.3)).toBe('pos');
    expect(tone(-0.3)).toBe('neg');
    expect(tone(0.3, true)).toBe('unc');
    expect(tone(0.001)).toBe('neutral');
  });
});

describe('state', () => {
  const text = 'Autót veszek, és biciklivel járok dolgozni.';

  it('applies the user edits on top of the text', () => {
    const interpretation = interpret(text, 'hu');
    const list = effectiveFactors(interpretation, {
      removed: ['buy_car'],
      added: ['quit_smoking'],
      intensity: { cycle_commute: 0.5 },
    });
    expect(list).toEqual([
      { id: 'cycle_commute', intensity: 0.5 },
      { id: 'quit_smoking', intensity: 1 },
    ]);
  });

  it('turns a saved factor list back into edits', () => {
    const interpretation = interpret(text, 'hu');
    const saved = [
      { id: 'cycle_commute', intensity: 0.5 },
      { id: 'quit_smoking', intensity: 1 },
    ];
    const o = overridesFor(interpretation, saved);
    expect(effectiveFactors(interpretation, o)).toEqual(saved);
    expect(overridesFor(interpretation, null)).toEqual({ removed: [], added: [], intensity: {} });
  });

  it('maps the duration setting', () => {
    expect(durationDays(DEFAULT_SETTINGS)).toBeUndefined();
    expect(durationDays({ ...DEFAULT_SETTINGS, duration: 'sustained' })).toBeNull();
    expect(durationDays({ ...DEFAULT_SETTINGS, duration: 90 })).toBe(90);
  });

  it('compares a scenario with the one-person base case', () => {
    const base = runAnalysis(
      text,
      { removed: [], added: [], intensity: {} },
      DEFAULT_SETTINGS,
      'hu',
    );
    expect(base.deltas).toBeNull();
    const many = runAnalysis(
      text,
      { removed: [], added: [], intensity: {} },
      { ...DEFAULT_SETTINGS, people: 100_000 },
      'hu',
    );
    expect(many.deltas!['fin.cashflow']).toBeCloseTo(0, 12);
    expect(Math.abs(many.deltas!['env.climate']!)).toBeGreaterThan(0);
  });
});
