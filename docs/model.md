# The general equation

This document defines how Impact Map turns a decision model into impact degrees.
The engine code is in [packages/engine/src](../packages/engine/src). All parameters are in
[constants.ts](../packages/engine/src/constants.ts).

## 1. Structure

| Level     | Count | Example                                                     |
| --------- | ----: | ----------------------------------------------------------- |
| Main area |     8 | Health                                                      |
| Subarea   |    36 | Physical health (scope: individual)                         |
| Factor    |   240 | Regular exercise, Gym membership (224 concrete, 16 generic) |
| Effect    |  1273 | Regular exercise → Physical health, w = 0.7                 |
| Link      |    69 | Physical health → Longevity, w = 0.5                        |
| Source    |   129 | WHO guidelines on physical activity (2020)                  |

Every effect and link has a signed weight `w ∈ [−1, 1]`, an evidence grade `A–D`, a lag
(`short` < 1 year, `mid` 1–5 years, `long` > 5 years) and sources. A positive value always means
that the subarea gets better.

Every subarea has a scope: `individual` (the person who decides), `community`, `society` or `global`.

## 2. From text to factors

1. The text is lower-cased and accents are removed.
2. It is split into sentences. Every sentence gets an intensity from frequency words
   (`daily` 1.0, `weekly` 0.75, `sometimes` 0.5; default 1.0).
3. Concrete factors are matched with patterns and keywords (Hungarian and English).
   Generic factors count only when a sentence has no concrete factor.
4. A negation (`nem`, `not`, `never`, …) in the same clause removes the factor, or switches it to
   its opposite when one is defined.
5. Details are detected as facets: frequency, duration, reason, amount, quantity, place, people,
   financing, condition, start.

### Precision

```
detail    = min(1, Σ facet weights / 5)
precision = 0.35 + 0.65 · detail        (at least one concrete factor)
precision = 0.15 + 0.20 · detail        (only generic factors)
precision = 0                           (no factor)
```

Facet weights: frequency 1.5, duration 1.5, reason 1, amount 1, quantity 0.75, place 0.75,
people 0.75, financing 0.5, condition 0.5, start 0.5.

Precision measures how specific the decision model is. It is not the accuracy of the forecast.
It narrows the uncertainty range (section 6). Details also change the values directly:
frequency changes the intensity, and duration changes the build-up (section 5).

## 3. Direct effect

For every subarea `s` and lag `ℓ`:

```
d[s, ℓ] = Σ_f  i_f · w_fs · c(ev_fs)          (only effects of f on s with lag ℓ)
```

`i_f` is the intensity (0.05–1). `c` is the evidence weight: A 0.95, B 0.8, C 0.6, D 0.4.

## 4. Spread

The impact spreads along the links, for `K` steps in total (the **Steps** setting, 1–7;
step 1 = direct effects only):

```
x⁽¹⁾ = d
x⁽ᵏ⁺¹⁾[t, max(ℓ, lag_st)] += α · w_st · c(ev_st) · x⁽ᵏ⁾[s, ℓ]        α = 0.6
x = Σ_{k=1..K} x⁽ᵏ⁾
```

The lag of a path is its slowest step. Cycles are allowed: they are part of the sum, and the
damping α keeps every path weaker than the one before it.

## 5. People, time window, duration

The scaled effect on subarea `s` is

```
E_s = Σ_ℓ  π(ℓ) · σ(N_eff(ℓ), scope_s) · x[s, ℓ]
```

**People scaling** `σ` — own effects do not grow; wider circles grow with `log10(N)` and saturate:

```
σ(N, individual) = 1
σ(N, scope)      = min(1.5, (1 + log10 N) / (1 + L_scope))      L = 3 community, 5 society, 7 global
```

**Time window** — when `N` people decide within `W` days, only the people whose effects overlap
count at the same time:

```
N_eff(ℓ) = max(1, N · min(1, T_ℓ / W))        T = 365 (short), 1825 (mid), 9125 (long) days
```

A sudden wave (small `W`) adds up short-term effects. A slow spread (large `W`) dilutes them.
Long-term effects add up anyway.

**Duration** — a decision kept for `D` days builds up only part of its slow effects:

```
π(ℓ) = 1                         (no duration: the decision is sustained)
π(ℓ) = min(1, D / B_ℓ)           B = 90 (short), 730 (mid), 1825 (long) days
```

`T` and `B` are model assumptions (evidence level D). They are documented here and shown in the
method dialog.

## 6. Impact degree, areas and uncertainty

```
h_s  = tanh(E_s / 0.6)                                   impact degree of a subarea, −1..+1
H_A  = tanh(Σ_{s∈A} E_s / 1.2)                           impact degree of a main area
net  = mean of H_A over the 8 main areas                 equal weight per main area
```

The uncertainty range uses two extra sums that spread exactly like `x`:
the absolute mass `a` (every path counted with `|value|`) and the confidence-weighted mass `b`
(every path counted with `|value| · Π c(ev)`):

```
δ_s     = Σ_ℓ π(ℓ) · σ(…) · (a[s, ℓ] − precision · b[s, ℓ])
range_s = [tanh((E_s − δ_s) / 0.6), tanh((E_s + δ_s) / 0.6)]
```

So a path with strong evidence in a detailed decision model has a narrow range; an assumption
in a two-word model has a wide one. A result is **uncertain** (yellow) when its range includes
zero, or when its strongest path rests on a model assumption (D).

## 7. Strongest path

For every subarea the engine keeps the path with the largest `Π|w|` within the step limit
(a dynamic program over the steps). The path gives the evidence grade (weakest link),
the confidence (`Π c`), the lag (slowest step) and the sources.

## 8. Impact tree (graph)

The graph unfolds the spread into a tree: every node is one path from the decision, so the same
subarea can appear on several branches. A node holds the per-lag values of its path, so its value
is exact. Nodes are added strongest first (a priority queue) until the weakest path falls below
the detail limit or the node limit is reached.

**Consistency:** without limits, the nodes of a subarea add up exactly to its `E_s` in the table.
The graph shows how much of the table it explains (coverage).

## 9. Decision categories

Categories are computed from the result. They are not a frame chosen before the analysis
(see [ADR 0002](adr/0002-decision-categories-are-derived.md)):

| Category  | Rule                                                                                 |
| --------- | ------------------------------------------------------------------------------------ |
| Domain    | the main area with the largest share of `Σ                                           | E   | ` (and the second if ≥ 20 %)          |
| Reach     | the widest scope that gets at least 10 % of `Σ                                       | E   | `                                     |
| Horizon   | the lag with the largest share of `Σ                                                 | E   | `                                     |
| Magnitude | `Σ                                                                                   | E   | `: small < 1.0 ≤ medium < 2.5 ≤ large |
| Certainty | mass-weighted mean of path confidence × precision: low < 0.25 ≤ medium < 0.45 ≤ high |

## 10. Verification

- **Parity:** with `W ≤ 365`, no duration and `K = 7`, the equation gives the same numbers as the
  original Python prototype (`per`, 2026-09-30) for 285 reference cases, within 1e-9, and the
  parser reads the same factors from 220 reference texts
  ([parity.test.ts](../packages/engine/test/parity.test.ts)).
- **Consistency:** tree sums equal table values; scores stay inside their ranges; the net is the
  mean of the main areas ([model.test.ts](../packages/engine/test/model.test.ts)).
- **Behaviour:** own effects do not scale with people; a longer window dilutes short effects; a
  short duration reduces slow effects; more detail narrows the range.

## 11. Limits

- Many weights are expert estimates (C and D). Every value is traceable to its sources.
- Factors do not interact: two factors add up; there are no combination effects.
- The result is guidance, not a forecast.
