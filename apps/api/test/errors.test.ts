import { InputError } from '@impact-map/engine';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { HttpError, toErrorResponse } from '../src/errors';

const withStatus = (fields: Record<string, unknown>, message = 'boom') =>
  Object.assign(new Error(message), fields);

describe('toErrorResponse', () => {
  it('keeps HttpError status, code and message', () => {
    expect(toErrorResponse(new HttpError(429, 'rate_limited', 'Slow down.'))).toEqual({
      statusCode: 429,
      body: { error: 'rate_limited', message: 'Slow down.' },
    });
  });

  it('maps engine input errors to 400', () => {
    expect(toErrorResponse(new InputError('steps must be a finite number.'))).toEqual({
      statusCode: 400,
      body: { error: 'bad_request', message: 'steps must be a finite number.' },
    });
    const renamed = Object.assign(new Error('bad input'), { name: 'InputError' });
    expect(toErrorResponse(renamed).statusCode).toBe(400);
  });

  it('lists at most 10 zod issues with a short summary', () => {
    const schema = z.strictObject({ list: z.array(z.string()) });
    const result = schema.safeParse({ list: Array.from({ length: 12 }, (_, i) => i) });
    expect(result.success).toBe(false);
    const { statusCode, body } = toErrorResponse(result.error);
    expect(statusCode).toBe(400);
    expect(body.issues).toHaveLength(10);
    expect(body.issues?.[0]).toEqual({
      path: 'list.0',
      message: 'Invalid input: expected string, received number',
    });
    expect(body.message).toBe(
      'Invalid request: list.0: Invalid input: expected string, received number (+11 more).',
    );
  });

  it('maps Fastify client errors by status', () => {
    expect(toErrorResponse(withStatus({ statusCode: 404 }))).toEqual({
      statusCode: 404,
      body: { error: 'not_found', message: 'Not found.' },
    });
    expect(toErrorResponse(withStatus({ statusCode: 429 })).body.error).toBe('rate_limited');
    expect(toErrorResponse(withStatus({ status: 405 }, 'Method not allowed'))).toEqual({
      statusCode: 405,
      body: { error: 'bad_request', message: 'Method not allowed' },
    });
  });

  it('never shows details of server errors', () => {
    for (const error of [
      new Error('password authentication failed for user "admin"'),
      withStatus({ statusCode: 503 }, 'upstream at 10.0.0.1 down'),
      withStatus({ statusCode: 200 }, 'odd status'),
      withStatus({ statusCode: 'x' }),
      'a thrown string',
      null,
    ]) {
      const response = toErrorResponse(error);
      expect(response.statusCode).toBeGreaterThanOrEqual(500);
      expect(response.body).toEqual({ error: 'internal', message: 'Internal server error.' });
    }
  });
});
