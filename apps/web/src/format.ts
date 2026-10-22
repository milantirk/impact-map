import type { Lang } from '@impact-map/engine';

const locale = (lang: Lang) => (lang === 'hu' ? 'hu-HU' : 'en-GB');

/** Signed impact degree, e.g. "+0,42". */
export function signed(value: number, lang: Lang, digits = 2): string {
  const rounded = Number(value.toFixed(digits));
  return new Intl.NumberFormat(locale(lang), {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
    signDisplay: rounded === 0 ? 'never' : 'always',
  }).format(rounded === 0 ? 0 : value);
}

export const integer = (value: number, lang: Lang) =>
  new Intl.NumberFormat(locale(lang), { maximumFractionDigits: 0 }).format(value);

export const percent = (share: number) => `${Math.round(share * 100)}`;

/** The people slider moves on a log10 scale in half steps: 0 -> 1, 9 -> 1 000 000 000. */
export const PEOPLE_STEPS = Array.from({ length: 19 }, (_, i) => i / 2);

export function peopleFromSlider(position: number): number {
  const exact = 10 ** position;
  const magnitude = 10 ** Math.floor(Math.log10(exact));
  return Math.round(exact / magnitude) * magnitude;
}

export function sliderFromPeople(people: number): number {
  const position = Math.log10(Math.max(1, people));
  return PEOPLE_STEPS.reduce(
    (best, p) => (Math.abs(p - position) < Math.abs(best - position) ? p : best),
    0,
  );
}

export const WINDOW_PRESETS = [1, 7, 30, 365, 1825, 3650, 9125] as const;
export const DURATION_PRESETS = [30, 90, 365, 1825] as const;

/** Graph detail: weakest path shown and node limit. */
export const DETAIL_LEVELS = [
  { minValue: 0.01, maxNodes: 150 },
  { minValue: 0.003, maxNodes: 400 },
  { minValue: 0.001, maxNodes: 900 },
] as const;

export type Tone = 'pos' | 'neg' | 'unc' | 'neutral';

/** Colour role of a value: green improves, red worsens, yellow uncertain, gray negligible. */
export function tone(score: number, uncertain = false): Tone {
  if (Math.abs(score) < 0.02) return 'neutral';
  if (uncertain) return 'unc';
  return score > 0 ? 'pos' : 'neg';
}
