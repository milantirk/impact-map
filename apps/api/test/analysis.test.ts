import { analyze, interpret, knowledge, LIMITS } from '@impact-map/engine';
import { describe, expect, it } from 'vitest';
import { json, testApp } from './helpers';

const TEXT = 'Autót veszek.';
const specific = [...knowledge.factors.values()].filter((f) => !f.fallback).map((f) => f.id);
const [FACTOR_A = '', FACTOR_B = ''] = specific;

describe('GET /api/v1/meta', () => {
  it('returns the Hungarian catalog by default', async () => {
    const res = await testApp().inject({ url: '/api/v1/meta' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['cache-control']).toBe('no-store');
    const body = res.json();
    expect(body.lang).toBe('hu');
    expect(body.areas.length).toBeGreaterThan(0);
    expect(body.factors.length).toBe(knowledge.factors.size);
    expect(body.limits).toEqual(LIMITS);
  });

  it('returns the English catalog with lang=en', async () => {
    const app = testApp();
    const hu = (await app.inject({ url: '/api/v1/meta?lang=hu' })).json();
    const res = await app.inject({ url: '/api/v1/meta?lang=en' });
    expect(res.statusCode).toBe(200);
    const en = res.json();
    expect(en.lang).toBe('en');
    expect(en.areas.map((a: { id: string }) => a.id)).toEqual(
      hu.areas.map((a: { id: string }) => a.id),
    );
    expect(en.areas[0].label).not.toBe(hu.areas[0].label);
  });

  it('rejects an unknown language', async () => {
    const res = await testApp().inject({ url: '/api/v1/meta?lang=de' });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_request', issues: [{ path: 'lang' }] });
  });
});

describe('POST /api/v1/interpret', () => {
  it('interprets Hungarian text like the engine', async () => {
    const res = await testApp().inject({
      method: 'POST',
      url: '/api/v1/interpret',
      ...json({ text: TEXT }),
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(interpret(TEXT, 'hu'));
    expect(res.json().factors.length).toBeGreaterThan(0);
  });

  it('interprets English text', async () => {
    const body = { text: 'I buy a car.', lang: 'en' };
    const res = await testApp().inject({ method: 'POST', url: '/api/v1/interpret', ...json(body) });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual(interpret(body.text, 'en'));
  });

  it('needs a text', async () => {
    const res = await testApp().inject({ method: 'POST', url: '/api/v1/interpret', ...json({}) });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({ error: 'bad_request', issues: [{ path: 'text' }] });
  });
});

describe('POST /api/v1/analyze', () => {
  const post = (payload: unknown) =>
    testApp().inject({ method: 'POST', url: '/api/v1/analyze', ...json(payload) });

  it('analyzes a text like the engine', async () => {
    const res = await post({ text: TEXT });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('application/json');
    const map = res.json();
    expect(map).toEqual(analyze({ text: TEXT }));
    expect(map.factors.length).toBeGreaterThan(0);
    expect(map.tree).not.toBeNull();
  });

  it('uses an explicit factor list and settings', async () => {
    const res = await post({
      text: TEXT,
      factors: [
        { id: FACTOR_A, intensity: 0.5 },
        { id: FACTOR_B, intensity: 7 },
      ],
      steps: 2,
      people: 1000,
      lang: 'en',
      tree: false,
    });
    expect(res.statusCode).toBe(200);
    const map = res.json();
    expect(map.lang).toBe('en');
    expect(map.factors.map((f: { id: string; intensity: number }) => [f.id, f.intensity])).toEqual([
      [FACTOR_A, 0.5],
      [FACTOR_B, LIMITS.intensity.max],
    ]);
    expect(map.params).toMatchObject({ steps: 2, people: 1000 });
    expect(map.tree).toBeNull();
  });

  it('clamps numbers to the limits', async () => {
    const res = await post({ text: TEXT, steps: 99, people: 0, windowDays: 1e9, durationDays: 0 });
    expect(res.statusCode).toBe(200);
    expect(res.json().params).toMatchObject({
      steps: LIMITS.steps.max,
      people: LIMITS.people.min,
      windowDays: LIMITS.windowDays.max,
      durationDays: LIMITS.durationDays.min,
    });
  });

  it('treats durationDays null as sustained', async () => {
    const res = await post({ text: TEXT, durationDays: null });
    expect(res.json().params.durationDays).toBeNull();
  });

  it.each([
    ['a text that is not a string', { text: 5 }],
    ['a number that is not a number', { text: TEXT, steps: 'many' }],
    ['an unknown language', { text: TEXT, lang: 'de' }],
    ['factors that are not a list', { factors: 'buy' }],
    ['a factor without id', { factors: [{ intensity: 1 }] }],
    ['an unknown field', { text: TEXT, foo: 1 }],
    ['a tree option of the wrong type', { text: TEXT, tree: 'yes' }],
    ['a list instead of an object', [TEXT]],
    ['too many factors', { factors: specific.slice(0, 21).map((id) => ({ id })) }],
    ['a text over the limit', { text: 'a'.repeat(LIMITS.textMax + 1) }],
  ])('rejects %s with 400', async (_name, payload) => {
    const res = await post(payload);
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('bad_request');
    expect(body.message).toMatch(/^Invalid request: /);
    expect(body.issues.length).toBeGreaterThan(0);
  });

  it('rejects an unknown factor with 400', async () => {
    const res = await post({ factors: [{ id: 'no_such_factor', intensity: 1 }] });
    expect(res.statusCode).toBe(400);
    expect(res.json()).toEqual({ error: 'bad_request', message: 'Unknown factor: no_such_factor' });
  });

  it('rejects invalid JSON with 400', async () => {
    const res = await testApp().inject({
      method: 'POST',
      url: '/api/v1/analyze',
      headers: { 'content-type': 'application/json' },
      payload: '{"text": ',
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });

  it('rejects a missing body with 400', async () => {
    const res = await testApp().inject({ method: 'POST', url: '/api/v1/analyze' });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe('bad_request');
  });

  it('rejects a body that is not JSON with 415', async () => {
    const res = await testApp().inject({
      method: 'POST',
      url: '/api/v1/analyze',
      headers: { 'content-type': 'text/plain' },
      payload: TEXT,
    });
    expect(res.statusCode).toBe(415);
    expect(res.json().error).toBe('bad_request');
  });

  it('rejects a body over 32 KB with 413', async () => {
    const res = await post({ text: 'a'.repeat(40_000) });
    expect(res.statusCode).toBe(413);
    expect(res.json()).toEqual({
      error: 'bad_request',
      message: 'Request body is too large (limit 32 KB).',
    });
  });
});
