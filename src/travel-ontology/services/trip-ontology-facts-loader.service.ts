/**
 * 从 world_facts 表加载 Trip 范围 Ontology 事实
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WorldFactRepository } from '../../world-facts/world-fact.repository';
import { WorldFactResolverService } from '../../world-facts/world-fact-resolver.service';
import type { TravelWorldFact } from '../contracts/travel-world-fact.types';
import { prismaWorldFactRowToTravelWorldFact } from '../adapters/prisma-world-fact.adapter';

@Injectable()
export class TripOntologyFactsLoaderService {
  private readonly logger = new Logger(TripOntologyFactsLoaderService.name);

  constructor(
    private readonly repo: WorldFactRepository,
    @Optional() private readonly resolver?: WorldFactResolverService,
  ) {}

  /** 加载 trip 关联的最新 Ontology 事实（factKey 前缀 trip:{tripId}:） */
  async loadForTrip(tripId: string): Promise<TravelWorldFact[]> {
    try {
      const rows = await this.repo.findLatestFactsForTrip(tripId);
      const facts = rows.map((row) => prismaWorldFactRowToTravelWorldFact(row));

      if (facts.length > 0) {
        this.logger.debug(`Loaded ${facts.length} ontology facts for trip ${tripId}`);
      }

      return facts;
    } catch (e) {
      this.logger.warn(
        `TripOntologyFactsLoader failed for ${tripId}: ${e instanceof Error ? e.message : String(e)}`,
      );
      return [];
    }
  }

  /** 单条解析（走 Resolver SSOT，供 ingest 后即时读取） */
  async resolveSubjectPredicate(
    subjectType: string,
    subjectId: string,
    predicate: string,
  ): Promise<TravelWorldFact | null> {
    if (!this.resolver) return null;
    const resolved = await this.resolver.resolveLatestBySubjectPredicate(
      subjectType,
      subjectId,
      predicate,
    );
    if (!resolved) return null;
    return prismaWorldFactRowToTravelWorldFact(resolved.fact);
  }
}
