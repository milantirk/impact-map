# Knowledge base

Location: [packages/engine/knowledge](../packages/engine/knowledge). The base comes from the
`per` prototype (2026-09-30) and is extended here. A frozen copy of the original is kept as a test
fixture, so the engine can be checked against the prototype at any time.

| File             | Content                                           |
| ---------------- | ------------------------------------------------- |
| `areas.json`     | 8 main areas with their subareas and scopes       |
| `factors/*.json` | Decision factors, grouped by topic                |
| `links.json`     | Causal links between subareas                     |
| `sources.json`   | Sources (author, year, title, venue, type)        |
| `examples.json`  | Example decisions                                 |
| `i18n/en.json`   | English labels, descriptions and English keywords |

## Add a factor

```json
{
  "id": "gym_membership",
  "label": "Edzőterem-bérlet",
  "group": "Egészség",
  "description": "Havi vagy éves bérlet egy edzőterembe.",
  "patterns": ["\\b(edzoterem|konditerem)\\w*"],
  "keywords": ["sportcipő"],
  "alternatives": ["hiking"],
  "fx": [["fin.cashflow", -0.15, "B", "short", "dellavigna_2006"]]
}
```

- `patterns`: regular expressions on lower-case, accent-free text. `keywords`: word-start matches
  (accents are removed automatically).
- `fx`: `[target subarea, weight −1..1, evidence A–D, lag, source id(s)]`. Without a source the
  effect is a model assumption (`per_assumption`).
- Optional: `excludes` (drop these factors when this one matches), `if_negated` (switch to this
  factor when negated), `fallback: true` (generic factor).
- Add the English label, description and keywords to `i18n/en.json`.
- New file? Import it in [knowledge.ts](../packages/engine/src/knowledge.ts).

## Evidence grades

| Grade | Weight | Meaning                                                              |
| ----- | -----: | -------------------------------------------------------------------- |
| A     |   0.95 | Meta-analysis, systematic review, RCT, or definition                 |
| B     |   0.80 | Large observational study, official statistics, international report |
| C     |   0.60 | Single study, theory, expert consensus                               |
| D     |   0.40 | Model assumption – to be checked                                     |

## Checks

`npm test` fails when a reference is broken (unknown subarea, factor or source; duplicate id or
link; invalid regular expression; weight outside −1..1), when the English overlay misses an id,
or when a known sentence is no longer recognised.

## Changes against the prototype

- New factors: `gym_membership`, `sports_gear`, `injury_return`, `medical_guidance`.
- `weight_loss` also recognises “túlsúlyos / overweight”.
- “havi bérlet” (monthly pass) alone no longer means public transport; a transport word is needed.
- New sources: Ardern 2016, Lauersen 2014, DellaVigna & Malmendier 2006.
