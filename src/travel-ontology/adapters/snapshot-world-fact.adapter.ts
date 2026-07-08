/**
 * RFC-003 Snapshot WorldFact ↔ TravelWorldFact 互转
 */

import type { WorldFact } from '../../travel-context/domain/travel-context.types';
import type { FactFreshness, FactVerificationStatus } from '../contracts/common-states.types';
import {
  TRAVEL_WORLD_FACT_SCHEMA_ID,
  type FactAuthorityLevel,
  type TravelWorldFact,
  type TravelWorldFactScope,
} from '../contracts/travel-world-fact.types';

const AUTHORITY_LEVELS: FactAuthorityLevel[] = [
  'GOVERNMENT',
  'OFFICIAL_OPERATOR',
  'SUPPLIER_CONTRACT',
  'USER_BOOKING',
  'USER_DECLARATION',
  'MODEL_INFERENCE',
  'THIRD_PARTY',
];

function asAuthorityLevel(raw: string): FactAuthorityLevel {
  return AUTHORITY_LEVELS.includes(raw as FactAuthorityLevel)
    ? (raw as FactAuthorityLevel)
    : 'THIRD_PARTY';
}

function subjectTypeFromWorldFactType(type: string): string {
  const dot = type.indexOf('.');
  return dot > 0 ? type.slice(0, dot) : type;
}

/** 从 Snapshot world.facts 解析 Ontology 事实（投影格式） */
export function parseTravelWorldFactsFromSnapshot(worldFacts: WorldFact[]): TravelWorldFact[] {
  const parsed: TravelWorldFact[] = [];

  for (const wf of worldFacts) {
    const value = wf.value;
    if (!value || typeof value !== 'object') continue;

    const record = value as Record<string, unknown>;
    if (record.predicate == null || record.payload === undefined) continue;

    parsed.push({
      schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
      factId: wf.factId,
      subjectType: subjectTypeFromWorldFactType(wf.type),
      subjectId: String(record.subjectId ?? ''),
      predicate: String(record.predicate),
      value: record.payload,
      scope: (record.scope as TravelWorldFactScope) ?? {},
      authorityLevel: asAuthorityLevel(wf.authorityLevel),
      source: {
        provider: wf.sourceId,
        ...(typeof record.source === 'object' && record.source
          ? (record.source as TravelWorldFact['source'])
          : {}),
      },
      validFrom: wf.effectiveFrom,
      expiresAt: wf.expiresAt,
      observedAt: wf.observedAt,
      confidence: wf.confidence,
      freshness: (record.freshness as FactFreshness) ?? 'FRESH',
      verificationStatus: (record.verificationStatus as FactVerificationStatus) ?? 'UNVERIFIED',
      replanTrigger: wf.replanTrigger,
    });
  }

  return parsed;
}
