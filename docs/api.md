# Impact Map HTTP API

`apps/api` is one Node.js 24 service (Fastify 5). It has three jobs:

1. The JSON API under `/api/v1`: the knowledge catalog, text interpretation, the full analysis
   (all from `@impact-map/engine`) and shareable saved decisions.
2. Health checks for the platform: `/healthz` and `/readyz`.
3. Hosting of the built web app (`apps/web/dist`) with a fallback to `index.html` for
   client-side routes.

The analysis is stateless and fast (about 1 ms per call). Only saved decisions need storage:
PostgreSQL in production, an in-memory store for development.

## Run it

```bash
npm run dev -w @impact-map/api     # tsx watch src/server.ts, http://localhost:8080
npm run build -w @impact-map/api   # one self-contained file: apps/api/dist/server.js
npm start -w @impact-map/api       # node dist/server.js
npx vitest run --project api       # tests (from the repository root)
```

## Endpoints

| Method | Path                       | Purpose                                       | Success        |
| ------ | -------------------------- | --------------------------------------------- | -------------- |
| GET    | `/healthz`                 | Liveness: the process is up                   | 200            |
| GET    | `/readyz`                  | Readiness: the decision store answers         | 200 (else 503) |
| GET    | `/api/v1/meta?lang=hu\|en` | Knowledge catalog for clients                 | 200            |
| POST   | `/api/v1/interpret`        | Text → factors, details, precision            | 200            |
| POST   | `/api/v1/analyze`          | Decision model → impact map                   | 200            |
| POST   | `/api/v1/decisions`        | Save a shareable, immutable decision model    | 201            |
| GET    | `/api/v1/decisions/:id`    | Load a saved decision model                   | 200 (else 404) |
| GET    | any other path             | Web app files from `STATIC_DIR`, SPA fallback | 200            |

All request bodies are JSON (`Content-Type: application/json`). Unknown fields are rejected.
`lang` is `"hu"` (default) or `"en"`.

### GET /healthz

```bash
curl -s http://localhost:8080/healthz
```

```json
{ "status": "ok", "version": "1.0.0" }
```

`version` is the engine `MODEL_VERSION`. This check never touches the database.

### GET /readyz

```bash
curl -s http://localhost:8080/readyz
```

`200 {"status":"ready"}` when the store answers a ping within 3 s, else
`503 {"status":"unavailable"}` (the cause goes to the log, not to the client).

### GET /api/v1/meta

```bash
curl -s 'http://localhost:8080/api/v1/meta?lang=en'
```

Returns `catalog(lang)` of the engine: `modelVersion`, `lang`, `areas` (with sub-areas),
`factors` (id, label, group, description, generic, alternatives), `examples`, `sources`,
`limits` and the model `params`. Clients should read input limits from `limits`.

```json
{
  "modelVersion": "1.0.0",
  "lang": "en",
  "areas": [{ "id": "econ", "label": "Economic", "description": "…", "children": ["…"] }],
  "factors": [
    {
      "id": "buy_car",
      "label": "Buying a car (combustion)",
      "group": "Transport",
      "description": "Buying your own petrol or diesel car and driving it every day.",
      "generic": false,
      "alternatives": ["buy_ev", "public_transport", "cycle_commute"]
    }
  ],
  "examples": [{ "id": "car", "title": "Buying a car", "text": "I'm buying a car." }],
  "sources": ["…"],
  "limits": { "textMax": 5000, "factorsMax": 20, "steps": { "min": 1, "max": 7, "default": 3 } },
  "params": { "alpha": 0.6, "tau": 0.6 }
}
```

### POST /api/v1/interpret

Body: `{ "text": string (0..5000 chars), "lang"?: "hu" | "en" }`.

```bash
curl -s -X POST http://localhost:8080/api/v1/interpret \
  -H 'content-type: application/json' \
  -d '{"text":"Autót veszek."}'
```

```json
{
  "factors": [
    {
      "id": "buy_car",
      "intensity": 1,
      "label": "Autóvásárlás (belső égésű)",
      "group": "Közlekedés",
      "match": "autot vesz",
      "generic": false
    }
  ],
  "negated": [],
  "facets": [],
  "missing": ["frequency", "duration", "reason"],
  "precision": 0.35,
  "durationDays": null,
  "words": 2
}
```

### POST /api/v1/analyze

Body (all fields optional):

| Field          | Type                                  | Meaning                                                      |
| -------------- | ------------------------------------- | ------------------------------------------------------------ |
| `text`         | string, 0..5000 chars                 | Decision model in plain words                                |
| `factors`      | `[{ id, intensity? }]`, max 20        | Explicit factor list; replaces the factors found in the text |
| `steps`        | number                                | Edges from the decision, 1..7 (default 3)                    |
| `people`       | number                                | How many people decide this way, 1..10⁹ (default 1)          |
| `windowDays`   | number                                | Within how many days they decide, 1..36500 (default 365)     |
| `durationDays` | number or `null`                      | How long the decision is kept; `null` = sustained            |
| `lang`         | `"hu"` or `"en"`                      | Label language (default `"hu"`)                              |
| `tree`         | `false` or `{ minValue?, maxNodes? }` | `false` = no impact tree; `maxNodes` up to 2000              |

Numbers are clamped to the limits and rounded by the engine (`steps: 99` → 7, `people: 0` → 1).
If `durationDays` is missing, the engine takes it from the text. Factor ids must exist in the
catalog; `intensity` defaults to 1 and is clamped to 0.05..1.

```bash
curl -s -X POST http://localhost:8080/api/v1/analyze \
  -H 'content-type: application/json' \
  -d '{"text":"I buy a car.","lang":"en","people":1000}'
```

The response is the engine `ImpactMap`:

```json
{
  "modelVersion": "1.0.0",
  "lang": "en",
  "interpretation": { "factors": ["…"], "precision": 0.35, "durationDays": null, "words": 4 },
  "factors": [
    { "id": "buy_car", "intensity": 1, "label": "Buying a car (combustion)", "group": "Transport" }
  ],
  "params": {
    "steps": 3,
    "people": 1000,
    "windowDays": 365,
    "durationDays": null,
    "precision": 0.35
  },
  "areas": [
    {
      "id": "econ",
      "label": "Economic",
      "score": 0.043,
      "range": [-0.06, 0.145],
      "children": ["…"]
    }
  ],
  "net": -0.128,
  "profile": {
    "domains": [{ "id": "fin", "label": "Financial", "share": 0.335 }],
    "reach": "community"
  },
  "tree": { "id": "root", "depth": 0, "subarea": "decision", "children": ["…"] },
  "treeStats": { "nodes": 50, "truncated": false, "coverage": 0.992 }
}
```

Numbers are rounded here; the API returns full precision. The tree has at most `tree.maxNodes`
nodes (default 400); weak branches are dropped first (`treeStats.truncated`).

### POST /api/v1/decisions

Saves a decision model so it can be shared by link. Saved decisions cannot change. There is no
authentication (public at first). Body:

```json
{
  "text": "I buy a car.",
  "factors": [{ "id": "buy_car", "intensity": 1 }],
  "settings": { "steps": 3, "people": 1, "windowDays": 365, "durationDays": null, "lang": "en" }
}
```

- `text`: 1..5000 chars, not blank. Required.
- `factors`: optional; `null` or missing = the factors come from the text. Checked with the
  engine `cleanFactors`: unknown ids give 400, duplicates are dropped, `intensity` is clamped.
- `settings`: required, every field required. Numbers are rounded to integers and must be
  inside the limits (`steps` 1..7, `people` 1..10⁹, `windowDays` 1..36500, `durationDays`
  1..36500 or `null`); out-of-range values give 400. Tip: copy `steps`, `people`, `windowDays`
  and `durationDays` from `params` of the analyze response (already clamped), and add `lang`.

```bash
curl -s -i -X POST http://localhost:8080/api/v1/decisions \
  -H 'content-type: application/json' \
  -d '{"text":"I buy a car.","settings":{"steps":3,"people":1,"windowDays":365,"durationDays":null,"lang":"en"}}'
```

```http
HTTP/1.1 201 Created
location: /api/v1/decisions/UkFUX0UkSj

{"id":"UkFUX0UkSj","createdAt":"2026-10-21T11:06:00.768Z"}
```

The id has 10 URL-safe characters (`A-Z a-z 0-9 _ -`, 60 random bits from the system CSPRNG).

### GET /api/v1/decisions/:id

```bash
curl -s http://localhost:8080/api/v1/decisions/UkFUX0UkSj
```

```json
{
  "id": "UkFUX0UkSj",
  "text": "I buy a car.",
  "factors": [{ "id": "buy_car", "intensity": 1 }],
  "settings": { "steps": 3, "people": 1, "windowDays": 365, "durationDays": null, "lang": "en" },
  "modelVersion": "1.0.0",
  "createdAt": "2026-10-21T11:06:00.768Z"
}
```

A malformed id gives 400; an unknown id gives `404 {"error":"not_found","message":"Decision not found."}`.
`modelVersion` is the engine version at save time: a client can show a note when the current
model is newer.

## Errors

Every API error has the same JSON shape. Stack traces and internal details never reach clients.

```json
{
  "error": "bad_request",
  "message": "Invalid request: steps: Invalid input: expected number, received string (+1 more).",
  "issues": [
    { "path": "steps", "message": "Invalid input: expected number, received string" },
    { "path": "lang", "message": "Invalid option: expected one of \"hu\"|\"en\"" }
  ]
}
```

| Status | `error`        | When                                                                                                                               |
| ------ | -------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| 400    | `bad_request`  | Validation failed (`issues` lists up to 10 problems), engine input error (for example `Unknown factor: x`), bad JSON, malformed id |
| 413    | `bad_request`  | Body over 32 KB                                                                                                                    |
| 415    | `bad_request`  | Body is not `application/json`                                                                                                     |
| 404    | `not_found`    | Unknown `/api` path or decision id; other unknown paths (see below)                                                                |
| 429    | `rate_limited` | Rate limit hit; see `retry-after`                                                                                                  |
| 500    | `internal`     | Unexpected error (logged with the request id)                                                                                      |

## Limits

| Limit                    | Value                                                         |
| ------------------------ | ------------------------------------------------------------- |
| Request body             | 32 KB                                                         |
| `text`                   | 5000 characters                                               |
| `factors`                | 20 items                                                      |
| Analyze numbers          | Clamped by the engine (see the analyze table)                 |
| Decision settings        | Validated: out of range = 400                                 |
| `/api/*` rate limit      | `RATE_LIMIT_MAX` requests per client per minute (default 120) |
| `POST /api/v1/decisions` | 20 per client per minute (its own budget)                     |

The rate limit applies to `/api/*` only (also to unknown `/api` paths), not to health checks or
static files. The client key is the `X-Azure-ClientIP` header (set by Azure Front Door) when it
holds a valid IP address, else the connection address; IPv6 addresses count per /64 network.
Responses carry `x-ratelimit-limit`, `x-ratelimit-remaining`, `x-ratelimit-reset`, and
`retry-after` on 429. The counters live in process memory, so each replica counts on its own.
Only expose the service through Front Door: a client that reaches it directly can set
`X-Azure-ClientIP` itself.

## Configuration

All settings come from environment variables. Empty values count as unset. Invalid values stop
the process at start with a clear message.

| Variable          | Default                                   | Meaning                                                                            |
| ----------------- | ----------------------------------------- | ---------------------------------------------------------------------------------- |
| `PORT`            | `8080`                                    | Listen port                                                                        |
| `HOST`            | `0.0.0.0` in production, else `127.0.0.1` | Listen address (`NODE_ENV=production` in the container)                            |
| `STATIC_DIR`      | see below                                 | Built web app directory                                                            |
| `TRUST_PROXY`     | `false`                                   | Trust `X-Forwarded-*` headers (Fastify `trustProxy`)                               |
| `LOG_LEVEL`       | `info`                                    | `fatal`, `error`, `warn`, `info`, `debug`, `trace` or `silent`                     |
| `RATE_LIMIT_MAX`  | `120`                                     | `/api` requests per client per minute                                              |
| `DATABASE_URL`    | –                                         | PostgreSQL connection string (password mode)                                       |
| `DB_AUTH`         | `password`                                | `entra` = Microsoft Entra ID token as the password                                 |
| `PGHOST`          | –                                         | Server host name (Entra mode)                                                      |
| `PGPORT`          | `5432`                                    | Server port (Entra mode)                                                           |
| `PGDATABASE`      | –                                         | Database name (Entra mode; pg default: the user name)                              |
| `PGUSER`          | –                                         | Database role, for example the managed identity name (Entra mode)                  |
| `PGSSLMODE`       | `verify-full` in Entra mode               | TLS mode (Entra mode: see below; with `DATABASE_URL`, prefer `sslmode` in the URL) |
| `AZURE_CLIENT_ID` | –                                         | Client id of a user-assigned managed identity (Entra mode)                         |

`STATIC_DIR` default: `public/` next to the server file when it exists (container layout:
`/app/server.js` + `/app/public`), else `apps/web/dist` of the repository (works from `src/` and
from `dist/`). If the directory does not exist, the service logs a warning and serves the API
only. Set `STATIC_DIR=/app/public` in the container to be explicit.

## Decision store

| Condition                                  | Store                                                             |
| ------------------------------------------ | ----------------------------------------------------------------- |
| `DATABASE_URL` is set                      | PostgreSQL with that connection string                            |
| `DB_AUTH=entra` (needs `PGHOST`, `PGUSER`) | PostgreSQL over TLS, Microsoft Entra ID token as password         |
| Neither                                    | In memory: not persistent (a warning is logged), max 10 000 items |

`DATABASE_URL` wins over `DB_AUTH=entra` (with a warning). `DB_AUTH=entra` without `PGHOST` or
`PGUSER` stops the start. `PGHOST` without `DB_AUTH=entra` is ignored (with a warning).

On start, the service runs an idempotent migration (up to 3 tries, because replicas that start
together can race):

```sql
CREATE TABLE IF NOT EXISTS decisions (
  id text PRIMARY KEY,
  text text NOT NULL,
  factors jsonb,
  settings jsonb NOT NULL,
  model_version text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS decisions_created_at_idx ON decisions (created_at);
```

The database role needs `CREATE` on the schema (PostgreSQL 15+ does not give it on `public` by
default) or the table must exist before. All queries use parameters. The pg pool has at most 10
connections.

### Microsoft Entra ID (Azure Database for PostgreSQL)

- Credential: `ManagedIdentityCredential` with `AZURE_CLIENT_ID` when it is set, else
  `DefaultAzureCredential`.
- Scope: `https://ossrdbms-aad.database.windows.net/.default`.
- The pool `password` is a function: pg calls it for every new connection, and it asks the
  credential for a token. The credential caches tokens and renews them before they expire, so
  every new connection gets a valid token. Open connections stay valid after the token expires.
- TLS is always on. `PGSSLMODE` keeps its libpq meaning:

| `PGSSLMODE`                               | Certificate chain checked | Host name checked |
| ----------------------------------------- | ------------------------- | ----------------- |
| unset or `verify-full`                    | yes                       | yes               |
| `verify-ca`                               | yes                       | no                |
| `require`, `prefer`, `allow`, `no-verify` | no                        | no                |
| `disable`                                 | not allowed: start fails  | –                 |

## Security headers

Set on every response by `@fastify/helmet`:

- `Content-Security-Policy: default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'`
- `Strict-Transport-Security: max-age=31536000; includeSubDomains`
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Cross-Origin-Opener-Policy: same-origin`, `Cross-Origin-Resource-Policy: same-origin`
- `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, plus the other helmet defaults

The web app must not use inline scripts or third-party origins. There is no CORS: the web app and
the API share one origin.

## Caching

| Response                                       | `Cache-Control`                       |
| ---------------------------------------------- | ------------------------------------- |
| `/assets/*` (hashed build files)               | `public, max-age=31536000, immutable` |
| `index.html`, SPA fallback, other static files | `no-cache` (revalidate with ETag)     |
| `/api/*`, `/healthz`, `/readyz`, JSON 404s     | `no-store`                            |

## Web app hosting

- Files in `STATIC_DIR` are listed once at start, so unknown paths never touch the file system.
  Restart the service after a new web build.
- SPA fallback: a `GET`/`HEAD` request outside `/api`, whose last path segment has no file
  extension and whose `Accept` header includes `text/html`, gets `index.html` (status 200).
  Examples: `/d/UkFUX0UkSj`, `/settings`.
- Everything else that is unknown gets the JSON 404, for example `/assets/missing.js`,
  `/robots.txt` or a `fetch` without `Accept: text/html`.

## Request ids and logs

- Request id: the `X-Request-ID` header, else `X-Azure-Ref` (Azure Front Door), else a random
  UUID. Only safe values are taken (max 200 characters of `A-Z a-z 0-9 _ - . : / + =`). The id
  comes back in the `x-request-id` response header and is in every log line as `reqId`.
- Logs: pino JSON lines on stdout, level from `LOG_LEVEL`. `authorization` and `cookie` headers
  are redacted. Request bodies (decision texts) are never logged. At the default level,
  `/healthz` and `/readyz` log only problems.

## Build and deployment

`npm run build -w @impact-map/api` runs tsup (`apps/api/tsup.config.ts`) and writes one ESM file,
`apps/api/dist/server.js` (about 5 MB). It bundles every dependency (engine and knowledge
included); only the optional native add-on `pg-native` stays external (pg never loads it). A
banner defines `require`, `__filename` and `__dirname` for the bundled CommonJS code. The file
runs without `node_modules`:

```bash
PORT=8080 STATIC_DIR=/app/public node server.js
```

Container layout: `/app/server.js` and `/app/public` (the web build). Shutdown: on `SIGTERM` or
`SIGINT` the service stops taking connections, finishes the requests in progress, closes the
database pool and exits with code 0. If that takes more than 10 s, it exits with code 1. If the
start fails (configuration, database migration), it exits with code 1.
