import {
  KNOWLEDGE_GRAPH_ALIASES,
  KNOWLEDGE_GRAPH_DESTINATIONS,
  KNOWLEDGE_GRAPH_POIS,
  type KnowledgeGraphAlias,
} from '../data/query-rewriting-knowledge-graph';
import type { StandardEntity } from '../interfaces/standard-entity.types';
import type { QueryRewriteScene } from '../utils/query-rewriting.types';

const SEED_SCENES: QueryRewriteScene[] = [
  'general',
  'hotel',
  'accommodation',
  'poi',
  'rag',
];

export function aliasEntryToStandardEntity(entry: KnowledgeGraphAlias): StandardEntity {
  return {
    id: entry.standard,
    name: entry.standard,
    type: entry.kind,
    parent_destination: entry.kind === 'destination' ? entry.standard : undefined,
  };
}

export function buildAliasSeedMaps(): Map<string, Map<string, StandardEntity>> {
  const byScene = new Map<string, Map<string, StandardEntity>>();

  for (const scene of SEED_SCENES) {
    const map = new Map<string, StandardEntity>();
    for (const entry of KNOWLEDGE_GRAPH_ALIASES) {
      map.set(entry.alias.trim().toLowerCase(), aliasEntryToStandardEntity(entry));
    }
    byScene.set(scene, map);
  }

  return byScene;
}

export function buildCandidateSeedLists(): Map<string, string[]> {
  const labels = [
    ...KNOWLEDGE_GRAPH_DESTINATIONS,
    ...KNOWLEDGE_GRAPH_POIS,
  ];
  const byScene = new Map<string, string[]>();
  for (const scene of SEED_SCENES) {
    byScene.set(scene, [...labels]);
  }
  return byScene;
}

export function scoreCandidateAgainstQuery(query: string, label: string): number {
  const q = query.toLowerCase();
  const l = label.toLowerCase();
  let score = 0;
  if (q.includes(l)) score += 5;
  if (l.length >= 2 && q.includes(l.slice(0, 2))) score += 1;
  if (l.length >= 4 && q.includes(l.slice(0, 4))) score += 2;
  return score;
}
