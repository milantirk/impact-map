import { LIMITS } from './constants';
import { labels } from './knowledge';
import { countWords, normalize } from './text';
import type { FacetId, Interpretation, KnowledgeBase, Lang, ParsedFactor } from './types';

const NEGATIONS = new Set(['nem', 'soha', 'sosem', 'semmikepp', 'not', 'never', 'dont', "don't"]);
/** A negation counts only inside its own clause. */
const CLAUSE_BREAK = /[,:]|\b(?:de|hanem|inkabb|viszont|helyett|es|but|and|instead)\b/;
const WORDS = /[\w'-]+/g;
const INTENSITY_WORDS: ReadonlyArray<[RegExp, number]> = [
  [/\b(minden nap|naponta|napi|rendszeresen|teljesen|mindig|daily|always)\b/, 1.0],
  [/\b(hetente|heti|tobbnyire|nagyreszt|weekly|mostly)\b/, 0.75],
  [/\b(neha|alkalmankent|reszben|kicsit|occasionally|sometimes|partly)\b/, 0.5],
];

const NUMBER_WORDS: Record<string, number> = {
  fel: 0.5,
  egy: 1,
  ket: 2,
  ketto: 2,
  harom: 3,
  negy: 4,
  ot: 5,
  hat: 6,
  het: 7,
  nyolc: 8,
  kilenc: 9,
  tiz: 10,
  tizenket: 12,
  husz: 20,
  harminc: 30,
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  twelve: 12,
  twenty: 20,
  thirty: 30,
};
const NUMBER = `(\\d+(?:[.,]\\d+)?|${Object.keys(NUMBER_WORDS).join('|')})`;
const UNIT_DAYS: Record<string, number> = {
  nap: 1,
  het: 7,
  honap: 30,
  ev: 365,
  day: 1,
  week: 7,
  month: 30,
  year: 365,
};
const DURATION_HU = new RegExp(
  `\\b${NUMBER}\\s+(nap|het|honap|ev)(?:ig|ra|re|on at|en at|on keresztul|en keresztul)\\b`,
);
const DURATION_EN = new RegExp(
  `\\bfor\\s+(?:half\\s+an?\\s+)?${NUMBER}?\\s*(day|week|month|year)s?\\b`,
);
const SUSTAINED =
  /\b(vegleg|orokre|eletem vegeig|hosszu tavon|tartosan|mostantol|for good|permanently|for life|long[- ]term|from now on)\b/;

const FACET_PATTERNS: Record<Exclude<FacetId, 'duration' | 'place'>, RegExp> = {
  frequency:
    /\b(minden nap|mindennap|naponta|napi|hetente|heti|havonta|evente|rendszeresen|mindig|neha|alkalmankent|alkalommal|\d+\s*(?:x|-?szor|-?szer|-?sor)|egyszer|ketszer|haromszor|negyszer|otszor|hatszor|daily|every (?:day|week|month|morning|evening)|weekly|monthly|once a|twice a|times a|times per|per (?:week|day|month)|regularly|sometimes|occasionally)\b/,
  reason: /\b(mert|miatt|ugyanis|azert|celom|celunk|because|due to|in order to|so that|my goal)\b/,
  amount:
    /(\b\d[\d\s.,]*\s*(?:ft|forint\w*|huf|eur\w*|usd|dollar\w*|gbp|font\w*)\b|[€$£]\s?\d|\b\d+\s*(?:ezer|millio\w*|milliard\w*|thousand|million|billion)\b)/,
  quantity:
    /\b\d+(?:[.,]\d+)?\s*(?:kg|kilo\w*|km|kilometer\w*|m2|negyzetmeter\w*|db|darab\w*|liter\w*|perc\w*|ora\w*|lepes\w*|minutes?|mins?|hours?|steps|lbs?|pounds?|miles?)\b/,
  people:
    /\b(csalad\w*|barat\w*|parom\w*|parjaval|felesegem\w*|ferjem\w*|gyerek\w*|kollega\w*|egyedul|tarsam\w*|szomszed\w*|edzovel|edzommel|with (?:my|a|friends|family|partner|kids|children|colleagues)|alone|together)\b/,
  financing:
    /\b(hitel\w*|kolcson\w*|keszpenz\w*|reszlet\w*|megtakaritas\w*|oner\w*|lizing\w*|loan|cash|mortgage|credit|installment\w*|savings|lease)\b/,
  condition: /\b(ha|amennyiben|felteve|kiveve|hacsak|if|unless|only when|provided)\b/,
  start:
    /\b(holnap\w*|mostantol|matol|azonnal|jovo\s+(?:het|honap|ev)\w*|hetfo\w*|januar\w*|februar\w*|marcius\w*|aprilis\w*|majus\w*|junius\w*|julius\w*|augusztus\w*|szeptember\w*|oktober\w*|november\w*|december\w*|tomorrow|today|tonight|next (?:week|month|year|monday)|starting|from now on|right away)\b/,
};
const PLACE_WORDS =
  /\b(otthon|itthon|irodaba\w*|munkahely\w*|edzoterem\w*|konditerem\w*|uszoda\w*|park\w*|erdo\w*|varos\w*|falu\w*|kulfold\w*|videk\w*|legkozelebbi|kozeli|at home|abroad|gym|office|nearby|downtown|in town)\b/;
/** Capitalised name with a Hungarian place suffix, not at the start of a sentence. */
const PLACE_NAME_HU =
  /[^.!?\n]\s(?<!\p{L})\p{Lu}\p{Ll}+(?:ban|ben|on|en|ön|ra|re|ba|be|ról|ről|ból|ből|hoz|hez|höz|nál|nél|tól|től)(?!\p{L})/u;
const PLACE_NAME_EN = /\b(?:in|at|near|to)\s+[A-Z][a-z]+/;

/** Facet weights: what a detail adds to the precision of the decision model. */
export const FACET_WEIGHT: Readonly<Record<FacetId, number>> = {
  frequency: 1.5,
  duration: 1.5,
  reason: 1,
  amount: 1,
  quantity: 0.75,
  place: 0.75,
  people: 0.75,
  financing: 0.5,
  condition: 0.5,
  start: 0.5,
};
/** Facet weight that gives full precision. */
const FULL_DETAIL = 5;
/** Facets worth suggesting when they are missing, best first. */
const SUGGESTED: readonly FacetId[] = [
  'frequency',
  'duration',
  'reason',
  'amount',
  'place',
  'people',
  'quantity',
];

export function detectDuration(normalized: string): number | null {
  for (const rx of [DURATION_HU, DURATION_EN]) {
    const m = rx.exec(normalized);
    if (!m) continue;
    const raw = m[1];
    const half = /half/.test(m[0]) ? 0.5 : 1;
    const count =
      raw === undefined ? 1 : (NUMBER_WORDS[raw] ?? Number.parseFloat(raw.replace(',', '.')));
    const unit = UNIT_DAYS[m[2] ?? ''];
    if (!Number.isFinite(count) || unit === undefined) continue;
    const days = Math.round(count * half * unit);
    return Math.min(LIMITS.durationDays.max, Math.max(LIMITS.durationDays.min, days));
  }
  return null;
}

export function detectFacets(text: string, normalized: string): FacetId[] {
  const found = new Set<FacetId>();
  for (const [facet, rx] of Object.entries(FACET_PATTERNS) as Array<[FacetId, RegExp]>) {
    if (rx.test(normalized)) found.add(facet);
  }
  if (detectDuration(normalized) !== null || SUSTAINED.test(normalized)) found.add('duration');
  if (PLACE_WORDS.test(normalized) || PLACE_NAME_HU.test(text) || PLACE_NAME_EN.test(text)) {
    found.add('place');
  }
  return (Object.keys(FACET_WEIGHT) as FacetId[]).filter((f) => found.has(f));
}

/**
 * Precision of the decision model, 0..1. A concrete factor gives the base;
 * every detail (how often, how long, why, ...) adds to it.
 */
export function precisionOf(facets: FacetId[], hasSpecific: boolean, hasAny: boolean): number {
  if (!hasAny) return 0;
  const detail = Math.min(1, facets.reduce((sum, f) => sum + FACET_WEIGHT[f], 0) / FULL_DETAIL);
  return hasSpecific ? 0.35 + 0.65 * detail : 0.15 + 0.2 * detail;
}

interface Found {
  id: string;
  intensity: number;
  match: string;
}

function matchFactors(
  kb: KnowledgeBase,
  sentence: string,
  ids: readonly string[],
  intensity: number,
  found: Map<string, Found>,
  negated: string[],
): number {
  let hits = 0;
  for (const candidate of ids) {
    const factor = kb.factors.get(candidate)!;
    let match: RegExpExecArray | null = null;
    for (const rx of factor.patterns) {
      match = rx.exec(sentence);
      if (match) break;
    }
    if (!match) continue;
    const clause = sentence.slice(0, match.index).split(CLAUSE_BREAK).at(-1) ?? '';
    const before = (clause.match(WORDS) ?? []).slice(-3);
    const inside = (match[0].match(WORDS) ?? []).slice(1);
    let id = candidate;
    // A negation written into the pattern ("nem dohanyzom") is its first word; a later one negates.
    if ([...before, ...inside].some((w) => NEGATIONS.has(w))) {
      if (!factor.ifNegated) {
        negated.push(candidate);
        continue;
      }
      id = factor.ifNegated;
    }
    hits += 1;
    const prev = found.get(id);
    if (!prev || intensity > prev.intensity) {
      found.set(id, { id, intensity, match: match[0].trim() });
    }
  }
  return hits;
}

/** Text -> decision factors, details and precision. Works for Hungarian and English. */
export function interpret(text: string, kb: KnowledgeBase, lang: Lang = 'hu'): Interpretation {
  const source = text.slice(0, LIMITS.textMax);
  const normalized = normalize(source);
  const found = new Map<string, Found>();
  const negated: string[] = [];
  for (const part of normalized.split(/[.!?;\n]+/)) {
    const sentence = part.trim();
    if (!sentence) continue;
    let intensity = 1.0;
    for (const [rx, value] of INTENSITY_WORDS)
      if (rx.test(sentence)) intensity = Math.min(intensity, value);
    // generic factors count only when the sentence has no concrete one
    if (!matchFactors(kb, sentence, kb.specific, intensity, found, negated)) {
      matchFactors(kb, sentence, kb.generic, intensity, found, negated);
    }
  }
  for (const id of [...found.keys()]) {
    if (!found.has(id)) continue;
    for (const excluded of kb.factors.get(id)!.excludes) found.delete(excluded);
  }

  const l = labels(kb, lang);
  const factors: ParsedFactor[] = [...found.values()].map((f) => {
    const factor = kb.factors.get(f.id)!;
    return {
      id: f.id,
      intensity: f.intensity,
      label: l.factor(f.id),
      group: l.group(factor.group),
      match: f.match,
      generic: factor.fallback,
    };
  });
  const facets = detectFacets(source, normalized);
  const hasSpecific = factors.some((f) => !f.generic);
  return {
    factors,
    negated: [...new Set(negated)]
      .filter((id) => !found.has(id))
      .sort()
      .map((id) => ({ id, label: l.factor(id) })),
    facets,
    missing: hasSpecific ? SUGGESTED.filter((f) => !facets.includes(f)).slice(0, 3) : [],
    precision: precisionOf(facets, hasSpecific, factors.length > 0),
    durationDays: detectDuration(normalized),
    words: countWords(source),
  };
}
