# ADR 0002: Decision categories are derived from the result

- Status: accepted
- Date: 2026-10-21

## Context

Should decisions get categories? Categories help to simplify the picture. But a category chosen
before the analysis frames the decision: it suggests where to look and hides effects in other
areas.

## Options

1. **No categories.** Nothing frames the decision, but the user gets no quick summary.
2. **Categories as an input.** The user or a classifier picks a category first. Simple, but it
   frames the analysis and can contradict the result.
3. **Categories as an output.** The engine computes them from the impact map.

## Decision

Option 3. The engine derives five labels from the result: domain (main area with the largest
share), reach (widest circle with at least 10 % of the impact), horizon (dominant lag),
magnitude (total impact) and certainty (evidence × precision). The labels never change the
computation. The rules are in [model.md](../model.md#9-decision-categories).

## Consequences

- The picture is simpler without a frame: the labels follow the evidence, not the other way round.
- A decision can be “Health · own life · long term · large impact · well founded” and still show a
  red branch in finances: nothing is hidden.
- The topic groups of factors (e.g. Health, Mobility) stay as search and browse aids only.
