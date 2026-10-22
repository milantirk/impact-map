import { setTimeout as sleep } from 'node:timers/promises';
import type { FastifyBaseLogger } from 'fastify';
import { buildApp } from './app';
import { ConfigError, loadConfig } from './config';
import { createStore } from './store';
import type { DecisionStore } from './store/types';

const SHUTDOWN_TIMEOUT_MS = 10_000;
const MIGRATION_ATTEMPTS = 3;

/** Retries, because replicas that start together can race on the first CREATE TABLE. */
async function migrate(store: DecisionStore, log: FastifyBaseLogger): Promise<void> {
  for (let attempt = 1; ; attempt++) {
    try {
      await store.init();
      return;
    } catch (err) {
      if (attempt >= MIGRATION_ATTEMPTS) throw err;
      log.warn({ err, attempt }, 'database migration failed, retrying');
      await sleep(1000 * attempt);
    }
  }
}

async function main(): Promise<void> {
  const config = loadConfig(process.env);

  // The pool exists before the app (and its logger); pool errors only happen later.
  const late: { log?: FastifyBaseLogger } = {};
  const { store, persistent, target } = await createStore(config.database, (err) =>
    late.log?.error({ err }, 'idle database client failed'),
  );
  const app = buildApp({ config, store });
  late.log = app.log;

  for (const warning of config.warnings) app.log.warn(warning);
  if (persistent) {
    app.log.info({ target }, 'decision store: PostgreSQL');
  } else {
    app.log.warn('decision store: in memory. Saved decisions are not persistent.');
  }

  try {
    await migrate(store, app.log);
    await app.listen({ port: config.port, host: config.host });
  } catch (err) {
    app.log.fatal({ err }, 'startup failed');
    await Promise.allSettled([app.close(), store.close()]);
    process.exit(1);
  }

  let stopping = false;
  const stop = (signal: NodeJS.Signals) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => {
      app.log.error('shutdown timed out');
      process.exit(1);
    }, SHUTDOWN_TIMEOUT_MS);
    timer.unref();
    // close() stops new connections and waits for the requests in progress.
    app
      .close()
      .then(() => store.close())
      .then(
        () => {
          app.log.info('shutdown complete');
          process.exit(0);
        },
        (err: unknown) => {
          app.log.error({ err }, 'shutdown failed');
          process.exit(1);
        },
      );
  };
  process.once('SIGTERM', stop);
  process.once('SIGINT', stop);
}

main().catch((err: unknown) => {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
});
