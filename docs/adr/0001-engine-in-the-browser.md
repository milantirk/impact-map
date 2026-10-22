# ADR 0001: The engine runs in the browser

- Status: accepted
- Date: 2026-10-21

## Context

The platform must be very fast. Users change sliders (steps, people, time window) and the text
all the time, and expect the map to follow at once. One analysis with the impact tree takes about
0.6 ms in the engine. A network round trip takes 30–300 ms.

## Decision

The engine is a pure TypeScript package without runtime dependencies. The web app imports it and
computes every analysis locally. The API uses the same package for API clients, so both give the
same numbers.

## Consequences

- Instant updates, no load on the server, works offline after the first load.
- The knowledge base (≈ 57 kB gzip) is part of the web bundle; it is a separate, long-cached chunk.
- The knowledge base is public. This is wanted: every value is traceable to its sources.
- A future, much larger knowledge base may need server-side computation; the API already has
  `/api/v1/analyze` for that.
