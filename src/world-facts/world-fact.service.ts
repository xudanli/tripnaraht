import { Injectable, Logger } from '@nestjs/common';
import { tripWorldFactKey } from './world-fact-trip.util';
import { WorldFactRepository } from './world-fact.repository';
import type { WorldFactAppendInput } from './world-fact.types';

/**
 * Append-only ingest：同 factKey 新行可链接 supersedes（审计链），不原地更新。
 */
@Injectable()
export class WorldFactService {
  private readonly logger = new Logger(WorldFactService.name);

  constructor(private readonly repo: WorldFactRepository) {}

  async append(input: WorldFactAppendInput): Promise<{ id: string }> {
    const prevId = await this.repo.findLatestIdByFactKey(input.factKey);
    const row = await this.repo.append({
      ...input,
      supersedesFactId: prevId,
    });
    this.logger.debug(`WorldFact append factKey=${input.factKey} id=${row.id} supersedes=${prevId ?? 'none'}`);
    return { id: row.id };
  }

  /** Trip 范围事实写入（factKey: trip:{tripId}:{suffix}，scope.tripId 自动注入） */
  async appendTripScoped(input: {
    tripId: string;
    keySuffix: string;
    subjectType: string;
    subjectId: string;
    predicate: string;
    valueJson: Record<string, unknown>;
    confidence?: number | null;
    sourceType: string;
    sourceRef?: string | null;
    observedAt?: Date | null;
    validTo?: Date | null;
  }): Promise<{ id: string }> {
    return this.append({
      factKey: tripWorldFactKey(input.tripId, input.keySuffix),
      subjectType: input.subjectType,
      subjectId: input.subjectId,
      predicate: input.predicate,
      valueJson: {
        ...input.valueJson,
        payload: input.valueJson.payload ?? input.valueJson.value ?? input.valueJson,
        scope: {
          ...(typeof input.valueJson.scope === 'object' ? input.valueJson.scope : {}),
          tripId: input.tripId,
        },
      },
      confidence: input.confidence,
      sourceType: input.sourceType,
      sourceRef: input.sourceRef,
      observedAt: input.observedAt,
      validTo: input.validTo,
      snapshotVersion: `trip:${input.tripId}`,
    });
  }
}
