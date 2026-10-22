import { randomBytes } from 'node:crypto';

export const DECISION_ID_LENGTH = 10;
const DECISION_ID = /^[A-Za-z0-9_-]{10}$/;

/** 10 URL-safe characters = 60 random bits from the system CSPRNG. */
export function newDecisionId(): string {
  return randomBytes(8).toString('base64url').slice(0, DECISION_ID_LENGTH);
}

export function isDecisionId(value: string): boolean {
  return DECISION_ID.test(value);
}

/** How many fresh ids a store tries before it gives up (a collision is very unlikely). */
export const ID_ATTEMPTS = 5;
