/**
 * Prisma WorldFact 行 → TravelWorldFact
 */

import type { WorldFact } from '@prisma/client';
import type { FactAuthorityLevel, FactFreshness, TravelWorldFact } from '../contracts/travel-world-fact.types';
import { TRAVEL_WORLD_FACT_SCHEMA_ID } from '../contracts/travel-world-fact.types';
import type { FactVerificationStatus } from '../contracts/common-states.types';

const SOURCE_TYPE_TO_AUTHORITY: Record<string, FactAuthorityLevel> = {
  user_booking: 'USER_BOOKING',
  user_declaration: 'USER_DECLARATION',
  supplier_contract: 'SUPPLIER_CONTRACT',
  government: 'GOVERNMENT',
  official: 'OFFICIAL_OPERATOR',
  research_shadow: 'MODEL_INFERENCE',
  decision_execution_sync: 'MODEL_INFERENCE',
  third_party: 'THIRD_PARTY',
};

function mapAuthority(sourceType: string): FactAuthorityLevel {
  const key = sourceType.toLowerCase().replace(/-/g, '_');
  return SOURCE_TYPE_TO_AUTHORITY[key] ?? 'THIRD_PARTY';
}

function freshnessFromRow(row: WorldFact, nowMs: number): FactFreshness {
  if (row.validTo && row.validTo.getTime() < nowMs) return 'EXPIRED';
  const ref = row.observedAt ?? row.createdAt;
  const ageMs = nowMs - ref.getTime();
  if (ageMs < 3600_000) return 'LIVE';
  if (ageMs < 86_400_000) return 'FRESH';
  if (ageMs < 604_800_000) return 'STALE';
  return 'STALE';
}

/** 将 DB world_facts 行映射为 Ontology 事实 */
export function prismaWorldFactRowToTravelWorldFact(
  row: WorldFact,
  nowMs = Date.now(),
): TravelWorldFact {
  const valueJson = (row.valueJson ?? {}) as Record<string, unknown>;
  const payload =
    valueJson.payload !== undefined
      ? valueJson.payload
      : valueJson.value !== undefined
        ? valueJson.value
        : valueJson;

  const scope =
    valueJson.scope && typeof valueJson.scope === 'object'
      ? (valueJson.scope as TravelWorldFact['scope'])
      : {};

  return {
    schemaId: TRAVEL_WORLD_FACT_SCHEMA_ID,
    factId: row.id,
    subjectType: row.subjectType,
    subjectId: row.subjectId,
    predicate: row.predicate,
    value: payload,
    scope,
    authorityLevel: mapAuthority(row.sourceType),
    source: {
      provider: row.sourceRef ?? row.sourceType,
      evidenceId: row.id,
      contractVersion:
        typeof valueJson.contractVersion === 'string' ? valueJson.contractVersion : undefined,
    },
    validFrom: row.validFrom?.toISOString(),
    validTo: row.validTo?.toISOString(),
    observedAt: (row.observedAt ?? row.createdAt).toISOString(),
    expiresAt: row.validTo?.toISOString(),
    confidence: row.confidence ?? 0.5,
    freshness: freshnessFromRow(row, nowMs),
    verificationStatus: (valueJson.verificationStatus as FactVerificationStatus) ?? 'UNVERIFIED',
    replanTrigger: valueJson.replanTrigger === true,
  };
}
