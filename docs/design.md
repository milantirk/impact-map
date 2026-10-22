# Design

Zen: few elements, much space, colour only where it carries meaning.

## Colours

| Colour             | Meaning                                                                      |
| ------------------ | ---------------------------------------------------------------------------- |
| Black, white, gray | Structure, text, neutral or negligible values                                |
| Blue               | You: the decision (root) and interaction (focus, active tab, sliders)        |
| Green              | Improves                                                                     |
| Red                | Worsens                                                                      |
| Yellow             | Uncertain: the direction is not sure, or the main path is a model assumption |

Light and dark themes follow the system setting; the ◐ button overrides it.

## Layout

```
┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐
  DECISION MODEL   text · factors · precision · categories      dashed, visible outline
└ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
┌ ─ ─ ─ ─ ─ ┐
  SCENARIO       graph | table                                   no frame: part of the page
  steps          fan tree / grouped table
  people
  time window
  duration
  areas
└ ─ ─ ─ ─ ─ ┘
```

- The two input sections (decision model, scenario) have a quiet dashed outline, like the sketch.
- The graph and the table have no frame and no background. They belong to the page.

## Graph: fan tree

- The decision is the blue point at the bottom centre. Paths fan out upwards; one dashed ring per
  step (numbered at the left end). Inner rings get relatively more room.
- Every node is one path. Its size shows the impact degree on that path; its colour the direction.
  Line width follows the strength; line opacity follows the evidence.
- A hollow node is collapsed: click it (or press Enter) to open or close its branch.
- Hover: the path back to the decision is highlighted, the rest fades, and the same subarea on
  other branches gets a blue ring. A card shows the degree, path, evidence, timing, confidence and
  causes.
- Labels are placed strongest first, with five candidate positions; a label that would overlap
  stays hidden until hover.
- Zoom with the wheel, move by dragging, double-click to fit.
- No animation when the user prefers reduced motion.

## Table

- Grouped by main area (click to open or close), sorted by impact strength.
- Impact degree with a centred bar and the uncertainty range behind it.
- Direct / indirect share, timing, evidence grade, main path.
- "Change" column against the one-person, one-year base case when the scenario differs.

## Writing

Short labels, plain words, one idea per line. Numbers are signed and localised (`+0,42` in
Hungarian, `+0.42` in English).
