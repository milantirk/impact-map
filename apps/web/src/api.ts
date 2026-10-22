import type { FactorInput, Lang } from '@impact-map/engine';

export interface SavedDecision {
  id: string;
  text: string;
  factors: FactorInput[] | null;
  settings: {
    steps: number;
    people: number;
    windowDays: number;
    durationDays: number | null;
    lang: Lang;
  };
  modelVersion: string;
  createdAt: string;
}

export type NewDecision = Pick<SavedDecision, 'text' | 'factors' | 'settings'>;

const json = { 'content-type': 'application/json', accept: 'application/json' };

export async function saveDecision(decision: NewDecision): Promise<{ id: string }> {
  const res = await fetch('/api/v1/decisions', {
    method: 'POST',
    headers: json,
    body: JSON.stringify(decision),
  });
  if (!res.ok) throw new Error(`save failed: ${res.status}`);
  return (await res.json()) as { id: string };
}

export async function loadDecision(id: string): Promise<SavedDecision> {
  const res = await fetch(`/api/v1/decisions/${encodeURIComponent(id)}`, { headers: json });
  if (!res.ok) throw new Error(`load failed: ${res.status}`);
  return (await res.json()) as SavedDecision;
}

export const shareUrl = (id: string) =>
  `${location.origin}${location.pathname}?d=${encodeURIComponent(id)}`;
