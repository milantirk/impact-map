import { PGlite } from '@electric-sql/pglite';
import { knowledge, LIMITS, MODEL_VERSION } from '@impact-map/engine';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { MemoryStore } from '../src/store/memory';
import { PostgresStore } from '../src/store/postgres';
import type { DecisionStore } from '../src/store/types';
import { json, testApp } from './helpers';

const specific = [...knowledge.factors.values()].filter((f) => !f.fallback).map((f) => f.id);
const [FACTOR_A = '', FACTOR_B = ''] = specific;

const SETTINGS = { steps: 3, people: 1, windowDays: 365, durationDays: null, lang: 'hu' };
const ID = /^[A-Za-z0-9_-]{10}$/;

interface StoreCase {
  name: string;
  open: () => Promise<{ store: DecisionStore; close: () => Promise<void> }>;
}

const cases: StoreCase[] = [
  {
    name: 'memory store',
    open: async () => {
      const store = new MemoryStore();
      return { store, close: () => store.close() };
    },
  },
  {
    name: 'Postgres store (PGlite)',
    open: async () => {
      const db = new PGlite();
      const store = new PostgresStore(db);
      await store.init();
      return { store, close: () => db.close() };
    },
  },
];

describe.each(cases)('decisions on the $name', ({ open }) => {
  let store: DecisionStore;
  let close: () => Promise<void>;

  beforeAll(async () => {
    ({ store, close } = await open());
  });

  afterAll(async () => {
    await close();
  });

  const save = (payload: unknown) =>
    testApp({ store }).inject({ method: 'POST', url: '/api/v1/decisions', ...json(payload) });
  const load = (id: string) => testApp({ store }).inject({ url: `/api/v1/decisions/${id}` });

  it('saves a decision and loads it back', async () => {
    const payload = {
      text: 'Autót veszek, és naponta azzal járok dolgozni.',
      factors: [
        { id: FACTOR_A, intensity: 0.5 },
        { id: FACTOR_B, intensity: 1 },
      ],
      settings: { steps: 4, people: 250, windowDays: 30, durationDays: 730, lang: 'en' },
    };
    const saved = await save(payload);
    expect(saved.statusCode).toBe(201);
    expect(saved.headers['cache-control']).toBe('no-store');
    const { id, createdAt } = saved.json();
    expect(id).toMatch(ID);
    expect(new Date(createdAt).toISOString()).toBe(createdAt);
    expect(saved.headers.location).toBe(`/api/v1/decisions/${id}`);
    expect(Object.keys(saved.json()).sort()).toEqual(['createdAt', 'id']);

    const loaded = await load(id);
    expect(loaded.statusCode).toBe(200);
    expect(loaded.headers['cache-control']).toBe('no-store');
    expect(loaded.json()).toEqual({ id, ...payload, modelVersion: MODEL_VERSION, createdAt });
  });

  it('saves null factors when they are missing or null', async () => {
    for (const payload of [
      { text: 'Holnaptól biciklivel járok.', settings: SETTINGS },
      { text: 'Holnaptól biciklivel járok.', factors: null, settings: SETTINGS },
    ]) {
      const { id } = (await save(payload)).json();
      expect((await load(id)).json()).toMatchObject({ factors: null, settings: SETTINGS });
    }
  });

  it('cleans factors and rounds settings before it saves them', async () => {
    const res = await save({
      text: 'x',
      factors: [
        { id: FACTOR_A, intensity: 9 },
        { id: FACTOR_A, intensity: 0.2 },
        { id: FACTOR_B, intensity: 0 },
      ],
      settings: { ...SETTINGS, steps: 2.4, people: 1e6 + 0.3 },
    });
    expect(res.statusCode).toBe(201);
    const decision = (await load(res.json().id)).json();
    expect(decision.factors).toEqual([
      { id: FACTOR_A, intensity: LIMITS.intensity.max },
      { id: FACTOR_B, intensity: LIMITS.intensity.min },
    ]);
    expect(decision.settings).toMatchObject({ steps: 2, people: 1_000_000 });
  });

  it('gives every save a new id', async () => {
    const payload = { text: 'Ugyanaz a döntés.', settings: SETTINGS };
    const first = (await save(payload)).json();
    const second = (await save(payload)).json();
    expect(first.id).not.toBe(second.id);
  });

  it.each([
    ['an empty text', { text: '', settings: SETTINGS }],
    ['a blank text', { text: '   ', settings: SETTINGS }],
    ['a text over the limit', { text: 'a'.repeat(LIMITS.textMax + 1), settings: SETTINGS }],
    ['missing settings', { text: 'x' }],
    ['steps out of range', { text: 'x', settings: { ...SETTINGS, steps: 8 } }],
    ['people out of range', { text: 'x', settings: { ...SETTINGS, people: 0 } }],
    ['a missing durationDays', { text: 'x', settings: { ...SETTINGS, durationDays: undefined } }],
    ['an unknown language', { text: 'x', settings: { ...SETTINGS, lang: 'de' } }],
    ['an unknown settings field', { text: 'x', settings: { ...SETTINGS, extra: 1 } }],
    ['an unknown field', { text: 'x', settings: SETTINGS, id: 'abcdefghij' }],
    ['factors that are not a list', { text: 'x', factors: {}, settings: SETTINGS }],
  ])('rejects %s with 400', async (_name, payload) => {
    const res = await save(payload);
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_request' });
    expect(res.json().issues.length).toBeGreaterThan(0);
  });

  it('rejects an unknown factor with 400', async () => {
    const res = await save({
      text: 'x',
      factors: [{ id: 'nope', intensity: 1 }],
      settings: SETTINGS,
    });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request', message: 'Unknown factor: nope' });
  });

  it.each(['short', 'elevenchars', 'has%20space', 'bad.char.x'])(
    'rejects the malformed id %s with 400',
    async (id) => {
      const res = await load(id);
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('bad_request');
    },
  );

  it('returns 404 for an unknown id', async () => {
    const res = await load('AAAAAAAAAA');
    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found', message: 'Decision not found.' });
  });
});
