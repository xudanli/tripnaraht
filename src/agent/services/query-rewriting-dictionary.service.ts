/**
 * Query Rewriting 知识图谱词表服务：Top-N 候选粗筛、别名归一化、Prompt 注入。
 */

import { Injectable, Optional } from '@nestjs/common';
import {
  KNOWLEDGE_GRAPH_ALIASES,
  KNOWLEDGE_GRAPH_DESTINATIONS,
  KNOWLEDGE_GRAPH_POIS,
  KNOWLEDGE_GRAPH_SPELL_CORRECTIONS,
  type KnowledgeGraphAlias,
} from '../data/query-rewriting-knowledge-graph';
import type { EntityResolutionCacheProvider } from '../interfaces/entity-resolution-cache.interface';
import { StaticEntityResolutionCacheService } from './static-entity-resolution-cache.service';

export interface EntityCandidate {
  label: string;
  kind: 'destination' | 'poi';
  score: number;
}

@Injectable()
export class QueryRewritingDictionaryService {
  constructor(
    @Optional() private readonly entityCache?: EntityResolutionCacheProvider,
  ) {}

  private get cache(): EntityResolutionCacheProvider {
    return this.entityCache ?? new StaticEntityResolutionCacheService();
  }

  async findRoughCandidatesAsync(
    query: string,
    selectedDestination?: string,
    limit = 12,
    scene = 'general',
  ): Promise<string[]> {
    const provider = this.entityCache as { getTopNCandidates?: (q: string, s: string, n: number) => Promise<string[]> };
    const redisCandidates =
      typeof provider?.getTopNCandidates === 'function'
        ? await provider.getTopNCandidates(query, scene, limit)
        : [];

    const vectorHits = await this.cache.findVectorCandidates(query, limit);
    const staticHits = this.findRoughCandidates(query, selectedDestination, limit);
    return [...new Set([...redisCandidates, ...vectorHits.map((h) => h.label), ...staticHits])].slice(
      0,
      limit,
    );
  }

  findRoughCandidates(query: string, selectedDestination?: string, limit = 12): string[] {
    const q = query.toLowerCase();
    const scored: EntityCandidate[] = [];

    for (const dest of KNOWLEDGE_GRAPH_DESTINATIONS) {
      let score = 0;
      if (selectedDestination && dest === selectedDestination) score += 3;
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

    if (selectedDestination && !scored.some((c) => c.label === selectedDestination)) {
      scored.push({ label: selectedDestination, kind: 'destination', score: 4 });
    }

    const uniq = new Map<string, number>();
    for (const c of scored.sort((a, b) => b.score - a.score)) {
      const prev = uniq.get(c.label) ?? 0;
      if (c.score > prev) uniq.set(c.label, c.score);
    }

    return [...uniq.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, limit)
      .map(([label]) => label);
  }

  /** 命中 query 的别名条目，用于 Prompt 图谱注入 */
  findMatchingAliases(query: string, limit = 8): KnowledgeGraphAlias[] {
    const q = query.toLowerCase();
    return KNOWLEDGE_GRAPH_ALIASES.filter((entry) => {
      const alias = entry.alias.toLowerCase();
      if (/^[a-z]{2,4}$/i.test(entry.alias)) {
        return new RegExp(`\\b${alias}\\b`, 'i').test(query);
      }
      return q.includes(alias);
    }).slice(0, limit);
  }

  /** 构建注入 Stage 1 Prompt 的知识图谱片段 */
  buildKnowledgeGraphPromptSection(query: string, selectedDestination?: string): string {
    const candidates = this.findRoughCandidates(query, selectedDestination);
    const aliases = this.findMatchingAliases(query);
    const aliasLine =
      aliases.length > 0
        ? aliases.map((a) => `${a.alias}→${a.standard}`).join(', ')
        : '（无命中别名）';

    return `【知识图谱词表约束】
合法候选目的地/POI：[${candidates.join(', ') || '（无粗筛命中，destination 不确定时省略）'}]
别名映射参考（必须使用标准名）：${aliasLine}
标准 POI 词表（节选）：[${KNOWLEDGE_GRAPH_POIS.slice(0, 6).join(', ')}]`;
  }

  async normalizeEntityAsync(raw: string | undefined | null): Promise<string | undefined> {
    const text = String(raw ?? '').trim();
    if (!text) return undefined;
    const cached = await this.cache.resolveAlias(text);
    if (cached?.standard) return cached.standard;
    return this.normalizeEntity(raw);
  }

  normalizeEntity(raw: string | undefined | null): string | undefined {
    const text = String(raw ?? '').trim();
    if (!text) return undefined;

    let result = text;
    for (const [wrong, right] of Object.entries(KNOWLEDGE_GRAPH_SPELL_CORRECTIONS)) {
      result = result.replace(new RegExp(wrong, 'g'), right);
    }

    for (const entry of KNOWLEDGE_GRAPH_ALIASES) {
      if (/^[\u4e00-\u9fa5]+$/.test(entry.alias)) {
        if (entry.standard && result.includes(entry.standard)) continue;
        if (result === entry.alias || result.includes(entry.alias)) {
          result = result.replace(new RegExp(entry.alias, 'g'), entry.standard);
        }
      } else if (new RegExp(`^${entry.alias}$`, 'i').test(result)) {
        result = entry.standard;
      }
    }

    return result.trim() || undefined;
  }

  resolveAliasesInText(text: string): string {
    let result = text;
    for (const [wrong, right] of Object.entries(KNOWLEDGE_GRAPH_SPELL_CORRECTIONS)) {
      result = result.replace(new RegExp(wrong, 'g'), right);
    }
    for (const entry of KNOWLEDGE_GRAPH_ALIASES) {
      if (/^[\u4e00-\u9fa5]+$/.test(entry.alias)) {
        if (entry.standard && result.includes(entry.standard)) continue;
        result = result.replace(new RegExp(entry.alias, 'g'), entry.standard);
      } else {
        result = result.replace(new RegExp(`\\b${entry.alias}\\b`, 'gi'), entry.standard);
      }
    }
    return result.replace(/\s+/g, ' ').trim();
  }

  constrainDestination(
    destination: string | undefined,
    candidates: string[],
  ): string | undefined {
    const normalized = this.normalizeEntity(destination);
    if (!normalized) return undefined;

    if (candidates.includes(normalized)) return normalized;
    if (KNOWLEDGE_GRAPH_DESTINATIONS.includes(normalized)) return normalized;

    const fuzzy = KNOWLEDGE_GRAPH_DESTINATIONS.find(
      (d) => d.includes(normalized) || normalized.includes(d),
    );
    if (fuzzy && candidates.includes(fuzzy)) return fuzzy;

    return undefined;
  }
}
