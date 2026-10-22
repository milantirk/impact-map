import { describe, expect, it } from 'vitest';
import { detectDuration, detectFacets, interpret, knowledge, normalize, precisionOf } from '../src';
import { ids } from './helpers';

const EXAMPLES: Record<string, string[]> = {
  car: ['buy_car'],
  water: ['water_filter'],
  everyday: ['screen_time_reduce', 'family_time', 'hiking', 'composting', 'food_waste_reduce'],
  smoke: ['quit_smoking'],
  bike: ['cycle_commute'],
  ev_remote: ['buy_ev', 'remote_work'],
  degree_loan: ['university_degree', 'consumer_loan'],
  business: ['start_business', 'solar_panels'],
  abroad: ['move_abroad'],
  family: ['have_child', 'mortgage'],
  lifestyle: ['plant_based', 'regular_exercise', 'quit_alcohol'],
  rural: ['move_rural', 'remote_work', 'save_invest', 'volunteering', 'cycle_commute'],
};

describe('interpretation', () => {
  it.each(knowledge.examples.map((x) => [x.id, x.text] as const))(
    'reads example %s',
    (id, text) => {
      expect(ids(interpret(text).factors)).toEqual(new Set(EXAMPLES[id]));
    },
  );

  it('reads the gym decision without a false public transport match', () => {
    const r = interpret(
      'Elmegyek az üzletbe, veszek egy sportcipőt, elmegyek a legközelebbi edzőterembe, veszek egy havi bérletet, és elkezdek edzeni, mert túlsúlyos lettem az elmúlt 1 hónapban egy sérülés miatt.',
    );
    expect(ids(r.factors)).toEqual(
      new Set([
        'regular_exercise',
        'weight_loss',
        'gym_membership',
        'sports_gear',
        'injury_return',
      ]),
    );
    expect(r.durationDays).toBeNull();
    expect(r.facets).toEqual(expect.arrayContaining(['reason', 'place']));
  });

  it('still reads a public transport pass', () => {
    expect(ids(interpret('Veszek egy havi BKV-bérletet.').factors)).toContain('public_transport');
  });

  it('adds medical guidance only in a training context', () => {
    expect(ids(interpret('Először elmegyek egy gyógytornászhoz.').factors)).toContain(
      'medical_guidance',
    );
    expect(ids(interpret('Orvoshoz megyek szűrésre.').factors)).not.toContain('medical_guidance');
  });

  it('handles negation and intensity', () => {
    const r = interpret('Autót nem veszek, inkább biciklivel járok.');
    expect(ids(r.factors)).toEqual(new Set(['cycle_commute']));
    expect(r.negated.map((n) => n.id)).toContain('buy_car');
    expect(interpret('Néha sportolok.').factors[0]!.intensity).toBe(0.5);
  });

  it('uses a generic factor only when no concrete one is found', () => {
    const generic = interpret('Veszek egy kanapét.').factors;
    expect(generic.every((f) => f.generic)).toBe(true);
    expect(interpret('Autót veszek.').factors.some((f) => f.generic)).toBe(false);
  });

  it('localises labels', () => {
    const hu = interpret('Autót veszek.', 'hu').factors[0]!;
    const en = interpret('Autót veszek.', 'en').factors[0]!;
    expect(hu.label).toBe('Autóvásárlás (belső égésű)');
    expect(en.label).not.toBe(hu.label);
  });
});

describe('details and precision', () => {
  it.each([
    ['egy évig sportolok', 365],
    ['3 hónapig edzek', 90],
    ['fél évig nem eszek húst', 183],
    ['két hétre bérelek', 14],
    ['I will run for 2 weeks', 14],
    ['for a year', 365],
    ['túlsúlyos lettem az elmúlt 1 hónapban', null],
  ] as const)('duration of "%s"', (text, days) => {
    expect(detectDuration(normalize(text))).toBe(days);
  });

  it('finds the details', () => {
    const text =
      'Hetente kétszer futok 5 km-t Budapesten a barátommal egy évig, mert fogyni akarok, ha jó idő van.';
    expect(detectFacets(text, normalize(text))).toEqual(
      expect.arrayContaining([
        'frequency',
        'duration',
        'reason',
        'quantity',
        'place',
        'people',
        'condition',
      ]),
    );
    expect(
      detectFacets(
        'Autót veszek 5 millió forintért hitelből.',
        normalize('Autót veszek 5 millió forintért hitelből.'),
      ),
    ).toEqual(expect.arrayContaining(['amount', 'financing']));
  });

  it('grows with detail and stays in range', () => {
    expect(precisionOf([], false, false)).toBe(0);
    expect(precisionOf(['reason'], false, true)).toBeLessThanOrEqual(0.35);
    const base = precisionOf([], true, true);
    const rich = precisionOf(['frequency', 'duration', 'reason', 'amount'], true, true);
    expect(base).toBeCloseTo(0.35, 12);
    expect(rich).toBeGreaterThan(base);
    expect(rich).toBeLessThanOrEqual(1);
    const short = interpret('Edzeni fogok.');
    const long = interpret('Hetente háromszor edzeni fogok egy évig, mert fogyni szeretnék.');
    expect(long.precision).toBeGreaterThan(short.precision);
    expect(short.missing.length).toBeGreaterThan(0);
  });
});
