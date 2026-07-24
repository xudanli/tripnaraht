/**
 * 静态词表 Entity Resolution 缓存（v1.1 降级层，后续可替换 Redis / Vector DB 实现）。
 */

import { Injectable } from '@nestjs/common';
import {
  KNOWLEDGE_GRAPH_ALIASES,
  KNOWLEDGE_GRAPH_DESTINATIONS,
  KNOWLEDGE_GRAPH_POIS,
} from '../data/query-rewriting-knowledge-graph';
import type {
  EntityResolutionCacheHit,
  EntityResolutionCacheProvider,
} from '../interfaces/entity-resolution-cache.interface';
import type { EntityCandidate } from './query-rewriting-dictionary.service';

@Injectable()
export class StaticEntityResolutionCacheService implements EntityResolutionCacheProvider {
  async resolveAlias(alias: string): Promise<EntityResolutionCacheHit | undefined> {
    const q = alias.trim().toLowerCase();
    if (!q) return undefined;

    const hit = KNOWLEDGE_GRAPH_ALIASES.find((entry) => {
      const a = entry.alias.toLowerCase();
      if (/^[a-z]{2,4}$/i.test(entry.alias)) {
        return new RegExp(`\\b${a}\\b`, 'i').test(alias);
      }
      return q.includes(a) || a === q;
    });

    if (!hit) return undefined;
    return {
      standard: hit.standard,
      kind: hit.kind,
      source: 'static',
      score: 1,
    };
  }

  async findVectorCandidates(query: string, limit = 8): Promise<EntityCandidate[]> {
    const q = query.toLowerCase();
    const scored: EntityCandidate[] = [];

    for (const dest of KNOWLEDGE_GRAPH_DESTINATIONS) {
      let score = 0;
      if (q.includes(dest.toLowerCase())) score += 5;
      if (dest.length >= 2 && q.includes(dest.slice(0, 2))) score += 1;
      if (score > 0) scored.push({ label: dest, kind: 'destination', score });
    }

    for (const poi of KNOWLEDGE_GRAPH_POIS) {
      let score = 0;
      if (q.includes(poi.toLowerCase())) score += 5;
      if (poi.length >= 4 && q.includes(poi.slice(0, 4))) score += 2;
      if (score > 0) scored.push({ label: poi, kind: 'poi', score });
    }

    return scored
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);
  }
}
