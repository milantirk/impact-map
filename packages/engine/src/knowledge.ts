import areasFile from '../knowledge/areas.json' with { type: 'json' };
import examplesFile from '../knowledge/examples.json' with { type: 'json' };
import linksFile from '../knowledge/links.json' with { type: 'json' };
import sourcesFile from '../knowledge/sources.json' with { type: 'json' };
import f00 from '../knowledge/factors/00_core.json' with { type: 'json' };
import f10 from '../knowledge/factors/10_home_energy.json' with { type: 'json' };
import f20 from '../knowledge/factors/20_consumption_food.json' with { type: 'json' };
import f30 from '../knowledge/factors/30_health_safety.json' with { type: 'json' };
import f40 from '../knowledge/factors/40_mobility_travel.json' with { type: 'json' };
import f50 from '../knowledge/factors/50_work_education.json' with { type: 'json' };
import f60 from '../knowledge/factors/60_finance.json' with { type: 'json' };
import f70 from '../knowledge/factors/70_family_social_pets.json' with { type: 'json' };
import f80 from '../knowledge/factors/80_digital_civic_leisure.json' with { type: 'json' };
import f90 from '../knowledge/factors/90_general_fallback.json' with { type: 'json' };
import f95 from '../knowledge/factors/95_fitness_recovery.json' with { type: 'json' };
import en from '../knowledge/i18n/en.json' with { type: 'json' };
import { EVIDENCE_ORDER, LAGS, SCOPES } from './constants';
import { escapeKeyword, normalize } from './text';
import type {
  Area,
  Effect,
  Evidence,
  Example,
  Factor,
  KnowledgeBase,
  Lag,
  Lang,
  Link,
  Overlay,
  Scope,
  Source,
  Subarea,
} from './types';

interface RawEffect {
  target: string;
  w: number;
  ev: Evidence;
  lag?: Lag;
  src?: string[];
}

/** Short form: [target, weight, evidence, lag?, source(s)?] */
type RawFx = [string, number, Evidence, Lag?, (string | string[])?];

export interface RawFactor {
  id: string;
  label: string;
  group?: string;
  description?: string;
  keywords?: string[];
  patterns?: string[];
  excludes?: string[];
  if_negated?: string;
  alternatives?: string[];
  fallback?: boolean;
  effects?: RawEffect[];
  fx?: RawFx[];
}

export interface RawKnowledge {
  areas: Array<{
    id: string;
    label: string;
    description?: string;
    children: Array<{ id: string; label: string; scope: Scope }>;
  }>;
  links: Array<{ from: string; to: string; w: number; ev: Evidence; lag?: Lag; src?: string[] }>;
  sources: Source[];
  examples: Example[];
  /** file name -> factors; files load in name order */
  factorFiles: Record<string, RawFactor[]>;
  overlays?: Partial<Record<Lang, Partial<Overlay>>>;
}

const factorsOf = (file: unknown): RawFactor[] => (file as { factors: RawFactor[] }).factors;

export const rawKnowledge: RawKnowledge = {
  areas: (areasFile as unknown as Pick<RawKnowledge, 'areas'>).areas,
  links: (linksFile as unknown as Pick<RawKnowledge, 'links'>).links,
  sources: (sourcesFile as unknown as Pick<RawKnowledge, 'sources'>).sources,
  examples: (examplesFile as unknown as Pick<RawKnowledge, 'examples'>).examples,
  factorFiles: {
    '00_core': factorsOf(f00),
    '10_home_energy': factorsOf(f10),
    '20_consumption_food': factorsOf(f20),
    '30_health_safety': factorsOf(f30),
    '40_mobility_travel': factorsOf(f40),
    '50_work_education': factorsOf(f50),
    '60_finance': factorsOf(f60),
    '70_family_social_pets': factorsOf(f70),
    '80_digital_civic_leisure': factorsOf(f80),
    '90_general_fallback': factorsOf(f90),
    '95_fitness_recovery': factorsOf(f95),
  },
  overlays: { en: en as unknown as Partial<Overlay> },
};

function emptyOverlay(o: Partial<Overlay> = {}): Overlay {
  return {
    areas: o.areas ?? {},
    subareas: o.subareas ?? {},
    factors: o.factors ?? {},
    groups: o.groups ?? {},
    sourceTypes: o.sourceTypes ?? {},
    examples: o.examples ?? {},
  };
}

const keywordPattern = (keyword: string) => '\\b' + escapeKeyword(normalize(keyword));

function expandFactor(raw: RawFactor, extraKeywords: string[]): Factor {
  const effects: Effect[] = (raw.effects ?? []).map((e) => ({
    target: e.target,
    w: e.w,
    ev: e.ev,
    lag: e.lag ?? 'mid',
    src: e.src ?? [],
  }));
  for (const [target, w, ev, lag, src] of raw.fx ?? []) {
    const sources = src ?? 'per_assumption';
    effects.push({
      target,
      w,
      ev,
      lag: lag ?? 'mid',
      src: typeof sources === 'string' ? [sources] : sources,
    });
  }
  const keywords = [...(raw.keywords ?? []), ...extraKeywords].map(keywordPattern);
  return {
    id: raw.id,
    label: raw.label,
    group: raw.group ?? 'Egyéb',
    description: raw.description ?? '',
    patterns: [...(raw.patterns ?? []), ...keywords].map((p) => new RegExp(p)),
    excludes: raw.excludes ?? [],
    ifNegated: raw.if_negated,
    alternatives: raw.alternatives ?? [],
    fallback: Boolean(raw.fallback),
    effects,
  };
}

/** Build and check a knowledge base. Throws with a list of all broken references. */
export function buildKnowledge(raw: RawKnowledge): KnowledgeBase {
  const errors: string[] = [];
  const overlays: Partial<Record<Lang, Overlay>> = {};
  for (const [lang, overlay] of Object.entries(raw.overlays ?? {})) {
    overlays[lang as Lang] = emptyOverlay(overlay);
  }
  const extraKeywords = (id: string) =>
    Object.values(overlays).flatMap((o) => o.factors[id]?.keywords ?? []);

  const areas: Area[] = [];
  const sub = new Map<string, Subarea>();
  for (const a of raw.areas) {
    const children = a.children.map((c) => ({
      id: c.id,
      label: c.label,
      scope: c.scope,
      parent: a.id,
    }));
    areas.push({ id: a.id, label: a.label, description: a.description ?? '', children });
    for (const c of children) {
      if (!SCOPES.includes(c.scope)) errors.push(`${c.id}: bad scope ${c.scope}`);
      if (sub.has(c.id)) errors.push(`duplicate subarea ${c.id}`);
      sub.set(c.id, c);
    }
  }

  const factors = new Map<string, Factor>();
  for (const name of Object.keys(raw.factorFiles).sort()) {
    for (const f of raw.factorFiles[name] ?? []) {
      if (factors.has(f.id)) errors.push(`duplicate factor ${f.id} (${name})`);
      try {
        factors.set(f.id, expandFactor(f, f.fallback ? [] : extraKeywords(f.id)));
      } catch (e) {
        errors.push(`${f.id}: bad pattern (${(e as Error).message})`);
      }
    }
  }

  const sources = new Map(raw.sources.map((s) => [s.id, s] as const));
  const checkEdge = (where: string, e: { w: number; ev: string; lag: string; src: string[] }) => {
    if (!EVIDENCE_ORDER.includes(e.ev as Evidence)) errors.push(`${where}: bad evidence ${e.ev}`);
    if (!LAGS.includes(e.lag as Lag)) errors.push(`${where}: bad lag ${e.lag}`);
    if (!(e.w >= -1 && e.w <= 1)) errors.push(`${where}: weight outside [-1, 1]`);
    for (const s of e.src) if (!sources.has(s)) errors.push(`${where}: unknown source ${s}`);
  };

  for (const f of factors.values()) {
    for (const e of f.effects) {
      if (!sub.has(e.target)) errors.push(`${f.id}: unknown target ${e.target}`);
      checkEdge(`${f.id}->${e.target}`, e);
    }
    for (const ref of [...f.alternatives, ...f.excludes, ...(f.ifNegated ? [f.ifNegated] : [])]) {
      if (!factors.has(ref)) errors.push(`${f.id}: unknown factor ${ref}`);
    }
  }

  const links: Link[] = raw.links.map((l) => ({ ...l, lag: l.lag ?? 'mid', src: l.src ?? [] }));
  const out = new Map<string, Link[]>();
  const pairs = new Set<string>();
  for (const l of links) {
    for (const end of [l.from, l.to])
      if (!sub.has(end)) errors.push(`link: unknown subarea ${end}`);
    if (pairs.has(`${l.from}>${l.to}`)) errors.push(`duplicate link ${l.from}->${l.to}`);
    pairs.add(`${l.from}>${l.to}`);
    checkEdge(`link ${l.from}->${l.to}`, l);
    out.set(l.from, [...(out.get(l.from) ?? []), l]);
  }

  for (const [lang, o] of Object.entries(overlays)) {
    const unknown = (kind: string, ids: string[], known: (id: string) => boolean) => {
      for (const id of ids) if (!known(id)) errors.push(`overlay ${lang}: unknown ${kind} ${id}`);
    };
    unknown('area', Object.keys(o.areas), (id) => areas.some((a) => a.id === id));
    unknown('subarea', Object.keys(o.subareas), (id) => sub.has(id));
    unknown('factor', Object.keys(o.factors), (id) => factors.has(id));
    unknown('example', Object.keys(o.examples), (id) => raw.examples.some((x) => x.id === id));
  }

  if (errors.length > 0) throw new Error('Invalid knowledge base:\n' + errors.join('\n'));

  const all = [...factors.values()];
  return {
    areas,
    sub,
    subIds: areas.flatMap((a) => a.children.map((c) => c.id)),
    factors,
    specific: all.filter((f) => !f.fallback).map((f) => f.id),
    generic: all.filter((f) => f.fallback).map((f) => f.id),
    links,
    out,
    sources,
    examples: raw.examples,
    overlays,
  };
}

/** The knowledge base the app uses. */
export const knowledge: KnowledgeBase = buildKnowledge(rawKnowledge);

/** Localised labels with a Hungarian fallback. */
export function labels(kb: KnowledgeBase, lang: Lang) {
  const o = lang === 'hu' ? undefined : kb.overlays[lang];
  return {
    area: (id: string) => o?.areas[id]?.label ?? kb.areas.find((a) => a.id === id)?.label ?? id,
    areaDescription: (id: string) =>
      o?.areas[id]?.description ?? kb.areas.find((a) => a.id === id)?.description ?? '',
    sub: (id: string) => o?.subareas[id] ?? kb.sub.get(id)?.label ?? id,
    factor: (id: string) => o?.factors[id]?.label ?? kb.factors.get(id)?.label ?? id,
    factorDescription: (id: string) =>
      o?.factors[id]?.description ?? kb.factors.get(id)?.description ?? '',
    group: (name: string) => o?.groups[name] ?? name,
    sourceType: (type: string) => o?.sourceTypes[type] ?? type,
    example: (x: Example) => ({ ...x, ...(o?.examples[x.id] ?? {}) }),
  };
}

export type Labels = ReturnType<typeof labels>;
