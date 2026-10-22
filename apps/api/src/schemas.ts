import { LIMITS } from '@impact-map/engine';
import { z } from 'zod';

export const LangSchema = z.enum(['hu', 'en']);

const Text = z.string().max(LIMITS.textMax);

const Factor = z.strictObject({
  id: z.string().min(1).max(100),
  /** 0.05..1 (the engine clamps it) */
  intensity: z.number().default(1),
});

const Factors = z.array(Factor).max(LIMITS.factorsMax);

export const MetaQuerySchema = z.object({ lang: LangSchema.optional() });

export const InterpretBodySchema = z.strictObject({
  text: Text,
  lang: LangSchema.optional(),
});

/** Numbers are clamped to LIMITS by the engine, so only the types are checked here. */
export const AnalyzeBodySchema = z.strictObject({
  text: Text.optional(),
  factors: Factors.optional(),
  steps: z.number().optional(),
  people: z.number().optional(),
  windowDays: z.number().optional(),
  durationDays: z.number().nullable().optional(),
  lang: LangSchema.optional(),
  tree: z
    .union([
      z.boolean(),
      z.strictObject({ minValue: z.number().optional(), maxNodes: z.number().optional() }),
    ])
    .optional(),
});

/** Saved settings must already be valid: rounded to an integer, then checked against LIMITS. */
const whole = (range: { readonly min: number; readonly max: number }) =>
  z.number().transform(Math.round).pipe(z.int().min(range.min).max(range.max));

export const DecisionSettingsSchema = z.strictObject({
  steps: whole(LIMITS.steps),
  people: whole(LIMITS.people),
  windowDays: whole(LIMITS.windowDays),
  durationDays: whole(LIMITS.durationDays).nullable(),
  lang: LangSchema,
});

export const DecisionBodySchema = z.strictObject({
  text: Text.min(1).refine((value) => value.trim() !== '', { error: 'Text must not be blank.' }),
  factors: Factors.nullable().optional(),
  settings: DecisionSettingsSchema,
});
