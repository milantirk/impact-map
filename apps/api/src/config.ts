import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

export const LOG_LEVELS = ['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

/** TLS settings for the Entra mode, derived from PGSSLMODE (libpq meaning). */
export type EntraSsl = { rejectUnauthorized: boolean; verifyHostname: boolean };

export type DatabaseConfig =
  | { kind: 'memory' }
  | { kind: 'url'; connectionString: string }
  | {
      kind: 'entra';
      host: string;
      port: number;
      database: string | undefined;
      user: string;
      ssl: EntraSsl;
      /** client id of a user-assigned managed identity; unset = DefaultAzureCredential */
      clientId: string | undefined;
    };

export interface Config {
  port: number;
  host: string;
  staticDir: string;
  trustProxy: boolean;
  logLevel: LogLevel;
  rateLimitMax: number;
  database: DatabaseConfig;
  /** settings that are valid but probably not what the operator wanted */
  warnings: string[];
}

export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ConfigError';
  }
}

const text = z.string().trim().min(1);
const lowerEnum = <const T extends readonly [string, ...string[]]>(values: T) =>
  z.string().trim().toLowerCase().pipe(z.enum(values));
const port = (fallback: number) => z.coerce.number().int().min(0).max(65_535).default(fallback);

const EnvSchema = z.object({
  PORT: port(8080),
  NODE_ENV: text.optional(),
  /** default: all interfaces in production (container), only this machine otherwise */
  HOST: text.optional(),
  STATIC_DIR: text.optional(),
  TRUST_PROXY: z.stringbool().default(false),
  LOG_LEVEL: lowerEnum(LOG_LEVELS).default('info'),
  RATE_LIMIT_MAX: z.coerce.number().int().min(1).max(1_000_000).default(120),
  DATABASE_URL: text.optional(),
  DB_AUTH: lowerEnum(['password', 'entra']).default('password'),
  PGHOST: text.optional(),
  PGPORT: port(5432),
  PGDATABASE: text.optional(),
  PGUSER: text.optional(),
  PGSSLMODE: lowerEnum([
    'disable',
    'allow',
    'prefer',
    'require',
    'verify-ca',
    'verify-full',
    'no-verify',
  ]).optional(),
  AZURE_CLIENT_ID: text.optional(),
});

type Env = z.infer<typeof EnvSchema>;

const MODULE_DIR = fileURLToPath(new URL('.', import.meta.url));

/**
 * Container layout: `<dir of server.js>/public`. Repository layout (from `src/` or `dist/`):
 * `apps/web/dist`. The container path wins when it exists.
 */
export function defaultStaticDir(moduleDir: string = MODULE_DIR): string {
  const containerDir = path.resolve(moduleDir, 'public');
  return existsSync(containerDir) ? containerDir : path.resolve(moduleDir, '../../web/dist');
}

function entraSsl(mode: Env['PGSSLMODE']): EntraSsl {
  switch (mode) {
    case 'disable':
      throw new ConfigError('DB_AUTH=entra needs TLS: PGSSLMODE=disable is not supported.');
    case 'allow':
    case 'prefer':
    case 'require':
    case 'no-verify':
      return { rejectUnauthorized: false, verifyHostname: false };
    case 'verify-ca':
      return { rejectUnauthorized: true, verifyHostname: false };
    default:
      return { rejectUnauthorized: true, verifyHostname: true };
  }
}

function databaseConfig(env: Env, warnings: string[]): DatabaseConfig {
  if (env.DATABASE_URL) {
    if (env.DB_AUTH === 'entra') warnings.push('DATABASE_URL is set, so DB_AUTH=entra is ignored.');
    return { kind: 'url', connectionString: env.DATABASE_URL };
  }
  if (env.DB_AUTH === 'entra') {
    if (!env.PGHOST || !env.PGUSER) {
      throw new ConfigError('DB_AUTH=entra needs PGHOST and PGUSER.');
    }
    return {
      kind: 'entra',
      host: env.PGHOST,
      port: env.PGPORT,
      database: env.PGDATABASE,
      user: env.PGUSER,
      ssl: entraSsl(env.PGSSLMODE),
      clientId: env.AZURE_CLIENT_ID,
    };
  }
  if (env.PGHOST) {
    warnings.push(
      'PGHOST is set, but DATABASE_URL is empty and DB_AUTH is not "entra": using the in-memory store.',
    );
  }
  return { kind: 'memory' };
}

/** Reads the configuration from environment variables. Empty values count as unset. */
export function loadConfig(
  source: Record<string, string | undefined> = process.env,
  moduleDir: string = MODULE_DIR,
): Config {
  const present: Record<string, string> = {};
  for (const key of Object.keys(EnvSchema.shape)) {
    const value = source[key];
    if (value !== undefined && value.trim() !== '') present[key] = value;
  }
  const parsed = EnvSchema.safeParse(present);
  if (!parsed.success) {
    const details = parsed.error.issues
      .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
      .join('; ');
    throw new ConfigError(`Invalid environment: ${details}`);
  }
  const env = parsed.data;
  const warnings: string[] = [];
  return {
    port: env.PORT,
    host: env.HOST ?? (env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'),
    staticDir: path.resolve(env.STATIC_DIR ?? defaultStaticDir(moduleDir)),
    trustProxy: env.TRUST_PROXY,
    logLevel: env.LOG_LEVEL,
    rateLimitMax: env.RATE_LIMIT_MAX,
    database: databaseConfig(env, warnings),
    warnings,
  };
}
