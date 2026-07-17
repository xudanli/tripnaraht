/**
 * 证据投影 + 过期判定
 */

import type {
  OverallReadinessFactInput,
  ReadinessDimensionCode,
  ReadinessEvidence,
  ReadinessEvidenceType,
} from '../types/overall-trip-readiness.types';
import { EVIDENCE_TYPE_CONFIDENCE } from './check-result-scores.util';

export type ProjectedEvidenceBundle = {
  evidence: ReadinessEvidence[];
  expiredCount: number;
  hasExpiredCritical: boolean;
  confidence: number;
};

function mapEvidenceType(raw?: string): ReadinessEvidenceType {
  const s = (raw ?? '').toLowerCase();
  if (s.includes('official') || s.includes('road') || s.includes('gov')) return 'OFFICIAL_API';
  if (s.includes('booking') || s.includes('confirm')) return 'BOOKING_CONFIRMATION';
  if (s.includes('operator')) return 'OPERATOR_CONFIRMATION';
  if (s.includes('user')) return 'USER_CONFIRMATION';
  if (s.includes('partner') || s.includes('api')) return 'PARTNER_API';
  if (s.includes('web') || s.includes('scrap')) return 'WEB_SOURCE';
  if (s.includes('ai') || s.includes('infer')) return 'AI_INFERENCE';
  return 'PARTNER_API';
}

function mapDimension(category?: string): ReadinessDimensionCode {
  const c = (category ?? '').toLowerCase();
  if (c === 'transport' || c === 'environment') return 'ROUTE';
  if (c === 'booking') return 'ACCOMMODATION';
  if (c === 'team_fit') return 'MEMBER';
  if (c === 'access_capacity' || c === 'experience_expectation') return 'ACTIVITY';
  if (c === 'schedule' || c === 'itinerary_completeness') return 'ROUTE';
  return 'ROUTE';
}

export function projectReadinessEvidence(
  input: OverallReadinessFactInput,
  nowIso?: string,
): ProjectedEvidenceBundle {
  const now = nowIso ? Date.parse(nowIso) : Date.now();
  const evidence: ReadinessEvidence[] = [...(input.evidenceSeeds ?? [])];

  for (const proof of input.feasibilityProofs ?? []) {
    const observedAt = proof.observedAt ?? input.calculatedAt ?? new Date(now).toISOString();
    const confidence =
      typeof proof.confidence === 'number'
        ? proof.confidence
        : EVIDENCE_TYPE_CONFIDENCE[mapEvidenceType(proof.evidenceType)];
    evidence.push({
      id: proof.id,
      dimension: mapDimension(proof.category),
      evidenceType: mapEvidenceType(proof.evidenceType),
      sourceName: proof.evidenceSource || '可行性证据',
      statement: proof.conclusion || proof.currentFact || proof.constraint,
      confidence,
      observedAt,
      expiresAt: proof.validUntil,
      relatedEntityType: 'ROUTE',
      relatedEntityId: proof.itemId ?? input.tripId,
    });
  }

  if (input.accommodation && input.accommodation.bookedNightCount > 0) {
    evidence.push({
      id: `accom-booking-${input.tripId}`,
      dimension: 'ACCOMMODATION',
      evidenceType: 'BOOKING_CONFIRMATION',
      sourceName: '行程住宿预订状态',
      statement: `${input.accommodation.bookedNightCount}/${input.accommodation.expectedNightCount} 晚已确认预订`,
      confidence: 1,
      observedAt: input.calculatedAt ?? new Date(now).toISOString(),
      relatedEntityType: 'ACCOMMODATION',
      relatedEntityId: input.tripId,
    });
  }

  if (input.transport?.vehicleConfirmed) {
    evidence.push({
      id: `transport-vehicle-${input.tripId}`,
      dimension: 'TRANSPORT',
      evidenceType: 'USER_CONFIRMATION',
      sourceName: '车型决策 / 约束写回',
      statement: '车辆或车型方案已确认',
      confidence: 0.95,
      observedAt: input.calculatedAt ?? new Date(now).toISOString(),
      relatedEntityType: 'TRANSPORT',
      relatedEntityId: input.tripId,
    });
  }

  if (input.transport?.insuranceConfirmed) {
    evidence.push({
      id: `transport-insurance-${input.tripId}`,
      dimension: 'TRANSPORT',
      evidenceType: 'USER_CONFIRMATION',
      sourceName: '租车保险决策',
      statement: '保险覆盖档位已确认',
      confidence: 0.95,
      observedAt: input.calculatedAt ?? new Date(now).toISOString(),
      relatedEntityType: 'TRANSPORT',
      relatedEntityId: input.tripId,
    });
  }

  let expiredCount = 0;
  let hasExpiredCritical = false;
  for (const e of evidence) {
    if (!e.expiresAt) continue;
    const exp = Date.parse(e.expiresAt);
    if (!Number.isFinite(exp) || exp >= now) continue;
    expiredCount += 1;
    if (
      e.dimension === 'ROUTE' ||
      e.evidenceType === 'OFFICIAL_API' ||
      e.evidenceType === 'PARTNER_API'
    ) {
      hasExpiredCritical = true;
    }
  }

  const confidence =
    evidence.length === 0
      ? 60
      : Math.round(
          (evidence.reduce((sum, e) => sum + e.confidence, 0) / evidence.length) * 100,
        );

  return {
    evidence,
    expiredCount,
    hasExpiredCritical,
    confidence: Math.max(0, Math.min(100, confidence)),
  };
}
