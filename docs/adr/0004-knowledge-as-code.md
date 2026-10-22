# ADR 0004: Knowledge as code, not a graph database (yet)

- Status: accepted
- Date: 2026-10-21

## Context

The impact map is a graph, and a graph database such as Neo4j was considered. The knowledge base
has 36 subareas, about 240 factors, about 1 300 effects and 69 links. It changes through reviewed
edits, and every change needs sources and tests.

## Decision

The knowledge base stays versioned JSON in the repository. The engine loads it into memory and
checks every reference at start. The graph is drawn in the browser with D3. PostgreSQL stores
only user data (shared decision models).

## Consequences

- Every change is reviewable in a pull request and covered by tests; no migrations, no drift
  between environments.
- Zero query latency; the whole graph fits in memory many times over.
- Revisit when the knowledge base reaches many thousands of links, or when non-developers must
  edit it through a UI. Then a graph store (Neo4j, or PostgreSQL with recursive queries) plus a
  review workflow is the next step.
