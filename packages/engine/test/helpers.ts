import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildKnowledge,
  type ImpactMap,
  type ImpactNode,
  type KnowledgeBase,
  type RawFactor,
} from '../src';

export const FIXTURE_DIR = fileURLToPath(new URL('./fixtures/per-2026-09-30/', import.meta.url));

/** The frozen knowledge base of the Python prototype (2026-09-30), without overlays. */
export function loadFixtureKnowledge(dir = FIXTURE_DIR): KnowledgeBase {
  const read = (file: string) => JSON.parse(readFileSync(join(dir, file), 'utf8'));
  const factorFiles: Record<string, RawFactor[]> = {};
  for (const file of readdirSync(join(dir, 'factors'))
    .filter((f) => f.endsWith('.json'))
    .sort()) {
    factorFiles[file.replace(/\.json$/, '')] = read(join('factors', file)).factors;
  }
  return buildKnowledge({
    areas: read('areas.json').areas,
    links: read('links.json').links,
    sources: read('sources.json').sources,
    examples: read('examples.json').examples,
    factorFiles,
  });
}

export const subareasOf = (map: ImpactMap) =>
  new Map(map.areas.flatMap((a) => a.children).map((c) => [c.id, c]));

export function walk(node: ImpactNode, visit: (n: ImpactNode) => void) {
  visit(node);
  node.children.forEach((c) => walk(c, visit));
}

export const ids = (list: Array<{ id: string }>) => new Set(list.map((f) => f.id));
