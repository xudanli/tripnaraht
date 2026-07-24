/**
 * Redis 别名热缓存 + 内存 L1 — Week 2 P1 实体消歧。
 *
 * Key 设计（兼容现有 RedisService / cache-manager）：
 * - tripnara:er:alias:{scene}:{alias} → StandardEntity JSON
 * - tripnara:er:candidates:{scene} → string[] JSON
 */

import { Injectable, Logger, OnModuleInit, Optional } from '@nestjs/common';
import { RedisService } from '../../redis/redis.service';
import type {
  EntityResolutionCacheHit,
  EntityResolutionCacheProvider,
} from '../interfaces/entity-resolution-cache.interface';
import type { ExactEntityResolution, StandardEntity } from '../interfaces/standard-entity.types';
import type { EntityCandidate } from '../services/query-rewriting-dictionary.service';
import {
  erAliasKey,
  erCandidatesKey,
  erScenesForLookup,
} from './entity-resolution-redis-keys.util';
import {
  aliasEntryToStandardEntity,
  buildAliasSeedMaps,
  buildCandidateSeedLists,
  scoreCandidateAgainstQuery,
} from './entity-resolution-seed.util';
import { KNOWLEDGE_GRAPH_ALIASES } from '../data/query-rewriting-knowledge-graph';
import { VectorEntityResolutionProvider } from './vector-entity-resolution.provider';

const EXACT_SKIP_LLM_THRESHOLD = 0.92;

@Injectable()
export class RedisEntityResolutionProvider
  implements EntityResolutionCacheProvider, OnModuleInit
{
  private readonly logger = new Logger(RedisEntityResolutionProvider.name);
  /** L1：进程内别名表（0ms，Redis 不可用时的降级） */
  private readonly aliasL1 = buildAliasSeedMaps();
  /** L1：候选实体池 */
  private readonly candidatesL1 = buildCandidateSeedLists();
  private seeded = false;

  constructor(
    @Optional() private readonly redis?: RedisService,
    @Optional() private readonly vectorEr?: VectorEntityResolutionProvider,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.seedFromStaticGraph();
  }

  /** Module 初始化：静态词表 → Redis 预热 */
  async seedFromStaticGraph(): Promise<void> {
    if (this.seeded) return;

    let redisWrites = 0;
    if (this.redis) {
      for (const [scene, aliasMap] of this.aliasL1.entries()) {
        for (const [alias, entity] of aliasMap.entries()) {
          try {
            await this.redis.set(erAliasKey(scene, alias), entity);
            redisWrites += 1;
          } catch (err: unknown) {
            const msg = err instanceof Error ? err.message : String(err);
            this.logger.warn(`Redis alias seed failed (${scene}/${alias}): ${msg}`);
          }
        }
        const candidates = this.candidatesL1.get(scene) ?? [];
        try {
          await this.redis.set(erCandidatesKey(scene), candidates, 0);
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          this.logger.warn(`Redis candidates seed failed (${scene}): ${msg}`);
        }
      }
    }

    this.seeded = true;
    this.logger.log(
      `Entity resolution 预热完成: scenes=${this.aliasL1.size}, aliases/scene=${KNOWLEDGE_GRAPH_ALIASES.length}, redis_writes=${redisWrites}`,
    );
  }

  /**
   * 1. 确定性消歧：精确别名 → 标准实体
   */
  async resolveExactEntity(query: string, scene: string): Promise<StandardEntity | null> {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return null;

    for (const sc of erScenesForLookup(scene)) {
      const hit = await this.lookupAlias(sc, normalized);
      if (hit) return hit;
    }
    return null;
  }

  /**
   * 从完整 query 中探测别名命中，用于 Stage 1 LLM 跳过分流。
   */
  async tryExactResolution(query: string, scene: string): Promise<ExactEntityResolution | null> {
    const trimmed = query.trim();
    if (!trimmed) return null;

    const normalizedFull = trimmed.toLowerCase();
    for (const sc of erScenesForLookup(scene)) {
      const direct = await this.lookupAlias(sc, normalizedFull);
      if (direct) {
        return {
          entity: direct,
          confidence: 0.98,
          skipStage1Llm: true,
          matchedAlias: normalizedFull,
          source: 'memory',
        };
      }
    }

    const matches = this.findAliasMatchesInQuery(trimmed);
    if (matches.length !== 1) return null;

    const { alias, exact, coverage } = matches[0];
    for (const sc of erScenesForLookup(scene)) {
      const entity = await this.lookupAlias(sc, alias);
      if (!entity) continue;

      const confidence =
        exact ? 0.96 : matches.length === 1 ? 0.94 : 0.82 + coverage * 0.12;
      return {
        entity,
        confidence,
        skipStage1Llm: confidence >= EXACT_SKIP_LLM_THRESHOLD,
        matchedAlias: alias,
        source: 'memory',
      };
    }

    return null;
  }

  /**
   * 2. 粗筛 Top-N 候选（注入 Stage 1 Prompt）
   */
  async getTopNCandidates(query: string, scene: string, limit = 5): Promise<string[]> {
    const merged: string[] = [];

    for (const match of this.findAliasMatchesInQuery(query.trim())) {
      for (const sc of erScenesForLookup(scene)) {
        const entity = await this.lookupAlias(sc, match.alias);
        if (entity?.name && !merged.includes(entity.name)) {
          merged.push(entity.name);
        }
      }
    }

    const vectorHits = await this.vectorEr?.searchTopNCandidates(query, limit);
    for (const hit of vectorHits ?? []) {
      if (!merged.includes(hit.label)) merged.push(hit.label);
    }
    if (merged.length >= limit) return merged.slice(0, limit);

    const pool = await this.loadCandidatePool(scene);
    const scored = pool
      .map((label) => ({ label, score: scoreCandidateAgainstQuery(query, label) }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const item of scored) {
      if (!merged.includes(item.label)) merged.push(item.label);
      if (merged.length >= limit) break;
    }
    if (merged.length > 0) return merged.slice(0, limit);

    return pool.slice(0, limit);
  }

  /** EntityResolutionCacheProvider — 别名归一 */
  async resolveAlias(alias: string): Promise<EntityResolutionCacheHit | undefined> {
    const normalized = alias.trim().toLowerCase();
    if (!normalized) return undefined;

    const entity =
      (await this.lookupAlias('general', normalized)) ??
      (await this.resolveExactEntity(alias, 'general'));
    if (!entity) return undefined;

    return {
      standard: entity.name,
      kind: entity.type,
      source: 'redis',
      score: 1,
    };
  }

  /** EntityResolutionCacheProvider — 向量粗筛优先，子串打分降级 */
  async findVectorCandidates(query: string, limit = 8): Promise<EntityCandidate[]> {
    const vectorHits = await this.vectorEr?.searchTopNCandidates(query, limit);
    if (vectorHits?.length) {
      return vectorHits;
    }

    const labels = await this.getTopNCandidates(query, 'general', limit);
    return labels.map((label, idx) => ({
      label,
      kind: 'destination' as const,
      score: limit - idx,
    }));
  }

  private async lookupAlias(
    scene: string,
    normalizedAlias: string,
  ): Promise<StandardEntity | null> {
    const l1 = this.aliasL1.get(scene)?.get(normalizedAlias);
    if (l1) return l1;

    if (!this.redis) return null;

    try {
      const cached = await this.redis.get<StandardEntity>(erAliasKey(scene, normalizedAlias));
      if (cached) {
        this.aliasL1.get(scene)?.set(normalizedAlias, cached);
        return cached;
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      this.logger.warn(`Redis alias lookup failed: ${msg}`);
    }

    return null;
  }

  private async loadCandidatePool(scene: string): Promise<string[]> {
    const l1 = this.candidatesL1.get(scene) ?? this.candidatesL1.get('general') ?? [];
    if (!this.redis) return l1;

    try {
      const cached = await this.redis.get<string[]>(erCandidatesKey(scene));
      if (cached?.length) return cached;
    } catch {
      /* L1 fallback */
    }
    return l1;
  }

  private findAliasMatchesInQuery(query: string): Array<{
    alias: string;
    exact: boolean;
    coverage: number;
  }> {
    const q = query.toLowerCase();
    const qLen = Math.max(q.length, 1);
    const out: Array<{ alias: string; exact: boolean; coverage: number }> = [];

    for (const entry of KNOWLEDGE_GRAPH_ALIASES) {
      const alias = entry.alias.toLowerCase();
      let matched = false;
      if (/^[a-z]{2,4}$/i.test(entry.alias)) {
        matched = new RegExp(`\\b${alias}\\b`, 'i').test(query);
      } else {
        matched = q.includes(alias);
      }
      if (!matched) continue;
      out.push({
        alias,
        exact: q === alias,
        coverage: alias.length / qLen,
      });
    }

    return out;
  }
}
