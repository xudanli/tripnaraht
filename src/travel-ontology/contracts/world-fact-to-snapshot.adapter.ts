/**
 * TravelWorldFact → Travel Context Snapshot WorldFact 投影
 *
 * RFC-003 WorldFact 是 Snapshot 读模型；TravelWorldFact 是 Ontology 层 SSOT。
 */

import type { WorldFact, WorldFactKind } from '../../travel-context/domain/travel-context.types';
import type { FactAuthorityLevel, TravelWorldFact } from './travel-world-fact.types';

const AUTHORITY_TO_KIND: Partial<Record<FactAuthorityLevel, WorldFactKind>> = {
  USER_DECLARATION: 'USER_DECLARED',
  USER_BOOKING: 'USER_DECLARED',
  MODEL_INFERENCE: 'SYSTEM_INFERRED',
  THIRD_PARTY: 'EXTERNAL_OBSERVED',
  GOVERNMENT: 'OFFICIAL_RULE',
  OFFICIAL_OPERATOR: 'EXTERNAL_OBSERVED',
  SUPPLIER_CONTRACT: 'OFFICIAL_RULE',
};

/** 将 Ontology 事实投影为 Snapshot world.facts 条目 */
export function projectTravelWorldFactToSnapshot(fact: TravelWorldFact): WorldFact {
  return {
    factId: fact.factId,
    type: `${fact.subjectType}.${fact.predicate}`,
    kind: AUTHORITY_TO_KIND[fact.authorityLevel] ?? 'EXTERNAL_OBSERVED',
    value: {
      subjectId: fact.subjectId,
      predicate: fact.predicate,
      payload: fact.value,
      scope: fact.scope,
      verificationStatus: fact.verificationStatus,
      freshness: fact.freshness,
      source: fact.source,
    },
    effectiveFrom: fact.validFrom,
    expiresAt: fact.expiresAt,
    observedAt: fact.observedAt,
    sourceId: fact.source.provider,
    authorityLevel: fact.authorityLevel,
    confidence: fact.confidence,
    replanTrigger: fact.replanTrigger,
  };
}

/** 批量投影 */
export function projectTravelWorldFactsToSnapshot(
  facts: TravelWorldFact[],
): WorldFact[] {
  return facts.map(projectTravelWorldFactToSnapshot);
}
