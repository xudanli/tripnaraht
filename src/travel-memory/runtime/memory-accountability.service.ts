/**
 * Decision Accountability 查询（Phase 1）。
 *
 * GET /decision/{id}/explanation
 * GET /memory/{id}/evidence
 */

import { Injectable, Optional } from '@nestjs/common';
import { PrismaTravelMemoryLedgerService } from '../ledger/prisma-travel-memory-ledger.service';
import { TravelMemoryRuntimeService } from './travel-memory-runtime.service';
import type { MemoryEventV1 } from '../types/memory-event.types';
import type { DecisionMemoryExplanationV1 } from './decision-memory-explanation.types';
import { TRAVEL_MEMORY_DESIGN_PRINCIPLE } from './memory-context-builder';
import type { MemoryEvidenceRefV1 as LedgerEvidenceRef } from '../types/memory-evidence-ref.types';

export type MemoryEvidenceQueryResponseV1 = {
  schemaId: 'tripnara.memory_evidence_query@v1';
  version: 1;
  memoryEventId: string;
  predicate: string;
  value: unknown;
  confidence: number;
  lifecycleStatus: string;
  evidence: LedgerEvidenceRef[];
  contradictionHints: string[];
  bitemporal: {
    valid_from: string;
    valid_to: string | null;
    recorded_at: string;
    superseded_at: string | null;
  };
};

@Injectable()
export class MemoryAccountabilityService {
  constructor(
    private readonly runtime: TravelMemoryRuntimeService,
    @Optional() private readonly durable?: PrismaTravelMemoryLedgerService,
  ) {}

  /**
   * 为什么这个建议出现？— 按 decisionId 汇总 Memory 使用/忽略线索。
   */
  async explainDecision(decisionId: string): Promise<DecisionMemoryExplanationV1> {
    const fromDurable = (await this.durable?.listByDecisionId(decisionId)) ?? [];
    const fromHot = this.runtime
      .getLedger()
      .list({ activeOnly: false, limit: 200 })
      .filter((e) => e.source.decisionId === decisionId);

    const byId = new Map<string, MemoryEventV1>();
    for (const e of [...fromHot, ...fromDurable]) {
      byId.set(e.memoryEventId, e);
    }
    const events = [...byId.values()];

    const memoryUsed = events
      .filter(
        (e) =>
          e.lifecycleStatus === 'ACTIVE' ||
          e.memoryType === 'DECISION_EPISODE_REF' ||
          e.memoryType === 'OUTCOME_REF',
      )
      .map((e) => ({
        key: e.predicate,
        value: e.value,
        source: mapSource(e),
        confidence: e.confidence,
        evidence: e.evidenceRefs.map(toExplainEvidence),
      }));

    const memoryIgnored = events
      .filter(
        (e) =>
          e.lifecycleStatus === 'CANDIDATE' ||
          e.status === 'CANDIDATE' ||
          e.status === 'SUPERSEDED',
      )
      .map((e) => ({
        key: e.predicate,
        value: e.value,
        reason:
          e.lifecycleStatus === 'CANDIDATE' || e.status === 'CANDIDATE'
            ? 'CANDIDATE_not_in_decision_context'
            : `lifecycle=${e.lifecycleStatus}`,
        authorityReason:
          e.lifecycleStatus === 'CANDIDATE'
            ? 'Trip/Reality authority; candidate not promoted'
            : undefined,
      }));

    return {
      schemaId: 'tripnara.decision_memory_explanation@v1',
      version: 1,
      decisionId,
      decisionQuestion: `decision ${decisionId}`,
      memoryUsed,
      memoryIgnored,
      designPrinciple: TRAVEL_MEMORY_DESIGN_PRINCIPLE,
    };
  }

  /**
   * 为什么认为有这个偏好？— 单条 Memory 的 evidenceRefs。
   */
  async explainMemory(memoryEventId: string): Promise<MemoryEvidenceQueryResponseV1 | null> {
    const hot = this.runtime
      .getLedger()
      .list({ activeOnly: false, limit: 500 })
      .find((e) => e.memoryEventId === memoryEventId);
    const durable = (await this.durable?.getById(memoryEventId)) ?? null;
    const event = durable ?? hot ?? null;
    if (!event) return null;

    const contradictionHints: string[] = [];
    if (event.status === 'SUPERSEDED' || event.lifecycleStatus === 'SUPERSEDED') {
      contradictionHints.push(`superseded_by=${event.supersededBy ?? 'unknown'}`);
    }
    const v = event.value as { attributionConfidence?: { contradictionEpisodeIds?: string[] } };
    if (v?.attributionConfidence?.contradictionEpisodeIds?.length) {
      contradictionHints.push(
        `contradiction_episodes=${v.attributionConfidence.contradictionEpisodeIds.join(',')}`,
      );
    }

    return {
      schemaId: 'tripnara.memory_evidence_query@v1',
      version: 1,
      memoryEventId: event.memoryEventId,
      predicate: event.predicate,
      value: event.value,
      confidence: event.confidence,
      lifecycleStatus: event.lifecycleStatus,
      evidence: event.evidenceRefs,
      contradictionHints,
      bitemporal: {
        valid_from: event.validTime.from,
        valid_to: event.validTime.to,
        recorded_at: event.systemTime.recordedAt,
        superseded_at: event.supersededBy ? event.systemTime.recordedAt : null,
      },
    };
  }
}

function mapSource(
  e: MemoryEventV1,
): DecisionMemoryExplanationV1['memoryUsed'][number]['source'] {
  if (e.source.type === 'USER_EXPLICIT') return 'EXPLICIT_USER';
  if (e.memoryType === 'DECISION_EPISODE_REF' || e.scope === 'DECISION') {
    return 'EPISODE';
  }
  if (e.scope === 'TRIP') return 'TRIP_CONSTRAINT';
  return 'ACTIVE_PROFILE';
}

function toExplainEvidence(r: LedgerEvidenceRef) {
  return {
    type:
      r.type === 'USER_EXPLICIT'
        ? ('EXPLICIT' as const)
        : r.type === 'DECISION_EPISODE' || r.type === 'CGUS_TRACE'
          ? ('EPISODE' as const)
          : r.type === 'OUTCOME'
            ? ('OUTCOME' as const)
            : ('EPISODE' as const),
    date: r.at,
    episodeId: r.type === 'DECISION_EPISODE' ? r.id : undefined,
    decisionId: r.type === 'CGUS_TRACE' ? r.id : undefined,
    summary: r.note ?? `${r.type}:${r.id}`,
  };
}
