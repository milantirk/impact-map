import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { interpret } from '../src';

const sentences = JSON.parse(
  readFileSync(new URL('./fixtures/english-sentences.json', import.meta.url), 'utf8'),
) as Array<{ text: string; expect: string[] }>;

describe('English decisions', () => {
  it('has test sentences', () => {
    expect(sentences.length).toBeGreaterThanOrEqual(40);
  });

  it.each(sentences.map((s) => [s.text, s.expect] as const))('reads "%s"', (text, expected) => {
    const found = interpret(text, 'en').factors.map((f) => f.id);
    expect(found).toEqual(expect.arrayContaining(expected));
  });

  it('reads the gym decision in English', () => {
    const found = interpret(
      'I buy running shoes, join the nearest gym and start training three times a week, because I gained weight after an injury.',
      'en',
    ).factors.map((f) => f.id);
    expect(found).toEqual(
      expect.arrayContaining(['gym_membership', 'sports_gear', 'injury_return', 'weight_loss']),
    );
  });
});
