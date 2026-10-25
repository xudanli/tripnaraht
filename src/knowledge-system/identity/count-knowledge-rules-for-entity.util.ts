/**
 * Count destination-pack knowledge rules that mention an entity (or its aliases).
 * Uses the Iceland knowledge pack catalog — currently the only indexed rule corpus.
 */

import { createIcelandKnowledgePackResolver } from '../../decision-runtime/packs/knowledge/iceland-knowledge-pack.resolver';

let cachedRulesJson: string[] | null = null;

function loadRuleBlobs(): string[] {
  if (cachedRulesJson) return cachedRulesJson;
  try {
    const rules = createIcelandKnowledgePackResolver().listRules();
    cachedRulesJson = rules.map((r) => JSON.stringify(r).toLowerCase());
  } catch {
    cachedRulesJson = [];
  }
  return cachedRulesJson;
}

export function countKnowledgeRulesForEntity(
  entityId: string,
  extraNeedles: string[] = [],
): number {
  const needles = [
    entityId,
    ...extraNeedles,
    entityId.startsWith('risk:') ? entityId.slice(5) : '',
  ]
    .map((s) => s.trim().toLowerCase())
    .filter((s) => s.length >= 3);
  if (!needles.length) return 0;
  const blobs = loadRuleBlobs();
  return blobs.filter((blob) => needles.some((n) => blob.includes(n))).length;
}
