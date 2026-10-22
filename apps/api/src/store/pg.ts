import type { TokenCredential } from '@azure/identity';
import type { PoolConfig } from 'pg';
import type { DatabaseConfig } from '../config';

export type PostgresConfig = Exclude<DatabaseConfig, { kind: 'memory' }>;

/** OAuth scope of Azure Database for PostgreSQL (Microsoft Entra authentication). */
export const ENTRA_SCOPE = 'https://ossrdbms-aad.database.windows.net/.default';

/**
 * pg calls this for every new connection. The credential caches tokens and renews them before
 * they expire, so each connection gets a currently valid token.
 */
export function entraPassword(credential: TokenCredential): () => Promise<string> {
  return async () => {
    const token = await credential.getToken(ENTRA_SCOPE);
    if (!token?.token) throw new Error('Microsoft Entra ID returned no token for PostgreSQL.');
    return token.token;
  };
}

/** User-assigned managed identity when a client id is given, else the default chain. */
export async function azureCredential(clientId: string | undefined): Promise<TokenCredential> {
  const identity = await import('@azure/identity');
  return clientId
    ? new identity.ManagedIdentityCredential({ clientId })
    : new identity.DefaultAzureCredential();
}

export async function poolConfig(
  db: PostgresConfig,
  credential: (clientId: string | undefined) => Promise<TokenCredential> = azureCredential,
): Promise<PoolConfig> {
  const common: PoolConfig = {
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 15_000,
    keepAlive: true,
    application_name: 'impact-map-api',
  };
  if (db.kind === 'url') return { ...common, connectionString: db.connectionString };
  return {
    ...common,
    host: db.host,
    port: db.port,
    database: db.database,
    user: db.user,
    ssl: db.ssl.verifyHostname
      ? { rejectUnauthorized: db.ssl.rejectUnauthorized }
      : { rejectUnauthorized: db.ssl.rejectUnauthorized, checkServerIdentity: () => undefined },
    password: entraPassword(await credential(db.clientId)),
  };
}

/** Where the store connects, without secrets (for logs). */
export function describeTarget(db: PostgresConfig): string {
  if (db.kind === 'entra') {
    return `postgres://${db.user}@${db.host}:${db.port}/${db.database ?? ''} (Microsoft Entra ID)`;
  }
  try {
    const url = new URL(db.connectionString);
    return `postgres://${url.hostname}${url.port ? `:${url.port}` : ''}${url.pathname} (DATABASE_URL)`;
  } catch {
    return 'postgres (DATABASE_URL)';
  }
}
