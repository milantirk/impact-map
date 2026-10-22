import { InputError } from '@impact-map/engine';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';

export type ErrorCode = 'bad_request' | 'not_found' | 'rate_limited' | 'internal';

export interface ErrorIssue {
  path: string;
  message: string;
}

export interface ErrorBody {
  error: ErrorCode;
  message: string;
  issues?: ErrorIssue[];
}

export const BODY_LIMIT_BYTES = 32 * 1024;
const MAX_ISSUES = 10;

/** An error with a known HTTP status and a message that is safe to show to clients. */
export class HttpError extends Error {
  readonly statusCode: number;
  readonly code: ErrorCode;

  constructor(statusCode: number, code: ErrorCode, message: string) {
    super(message);
    this.name = 'HttpError';
    this.statusCode = statusCode;
    this.code = code;
  }
}

export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
export const notFound = (message = 'Not found.') => new HttpError(404, 'not_found', message);

function statusOf(error: unknown): number {
  if (typeof error !== 'object' || error === null) return 500;
  const { statusCode, status } = error as { statusCode?: unknown; status?: unknown };
  const value = typeof statusCode === 'number' ? statusCode : status;
  return typeof value === 'number' && Number.isInteger(value) && value >= 400 && value <= 599
    ? value
    : 500;
}

function zodBody(error: z.ZodError): ErrorBody {
  const issues = error.issues.slice(0, MAX_ISSUES).map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
  const first = issues[0];
  const more = error.issues.length - 1;
  const summary = first ? `${first.path ? `${first.path}: ` : ''}${first.message}` : 'invalid';
  return {
    error: 'bad_request',
    message: `Invalid request: ${summary}${more > 0 ? ` (+${more} more)` : ''}.`,
    issues,
  };
}

/** Maps any thrown value to an HTTP status and a client-safe JSON body. */
export function toErrorResponse(error: unknown): { statusCode: number; body: ErrorBody } {
  if (error instanceof HttpError) {
    return { statusCode: error.statusCode, body: { error: error.code, message: error.message } };
  }
  if (error instanceof z.ZodError) return { statusCode: 400, body: zodBody(error) };
  if (error instanceof InputError || (error instanceof Error && error.name === 'InputError')) {
    return { statusCode: 400, body: { error: 'bad_request', message: error.message } };
  }
  const statusCode = statusOf(error);
  if (statusCode >= 500) {
    return { statusCode, body: { error: 'internal', message: 'Internal server error.' } };
  }
  if (statusCode === 404)
    return { statusCode, body: { error: 'not_found', message: 'Not found.' } };
  if (statusCode === 429) {
    return { statusCode, body: { error: 'rate_limited', message: 'Too many requests.' } };
  }
  if (statusCode === 413) {
    const message = `Request body is too large (limit ${BODY_LIMIT_BYTES / 1024} KB).`;
    return { statusCode, body: { error: 'bad_request', message } };
  }
  if (statusCode === 415) {
    const message = 'Unsupported Content-Type: send application/json.';
    return { statusCode, body: { error: 'bad_request', message } };
  }
  // Remaining 4xx errors come from Fastify itself (bad JSON, empty body, bad URL): safe messages.
  const message = error instanceof Error && error.message ? error.message : 'Bad request.';
  return { statusCode, body: { error: 'bad_request', message } };
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply) {
  const { statusCode, body } = toErrorResponse(error);
  if (statusCode >= 500) {
    request.log.error({ err: error }, 'request failed');
  } else {
    request.log.info({ statusCode, error: body.error }, body.message);
  }
  return reply.code(statusCode).header('cache-control', 'no-store').send(body);
}
