/**
 * L2 物理违规快照 — Trip metadata SSOT，供 Readiness L3 级联触发（替代 blocker 文本启发式）。
 */

import type { Prisma } from '@prisma/client';
import type { PhysicalViolationEvidenceContext } from './physical-violation-to-evidence.mapper';
import type {
  PhysicalEvaluationResult,
  PhysicalViolationItem,
} from '../validator/physical-validator.types';
import type { ExperienceFulfillmentState } from '../../../trips/experience-fulfillment/types/experience-fulfillment-state.types';

export const TRIP_PHYSICAL_VALIDATION_METADATA_KEY = 'physicalValidationLatest' as const;

export interface TripPhysicalValidationSnapshot {
  violations: PhysicalViolationItem[];
  evaluatedAt: string;
  validatorVersion: string;
  ruleBundleId: string;
  blocking: boolean;
  context?: PhysicalViolationEvidenceContext;
  source?: 'action_preview' | 'action_commit' | 'readiness';
  experienceFulfillment?: ExperienceFulfillmentState;
}

export function extractPhysicalContextFromActionInput(
  actionInput?: Record<string, unknown> | null,
): PhysicalViolationEvidenceContext | undefined {
  if (!actionInput || typeof actionInput !== 'object') return undefined;
  const physicalDomain = actionInput.physical_domain as Record<string, unknown> | undefined;
  const segmentId =
    typeof physicalDomain?.segment_id === 'string'
      ? physicalDomain.segment_id
      : typeof actionInput.segment_id === 'string'
        ? actionInput.segment_id
        : undefined;
  const poiId =
    typeof actionInput.poi_id === 'string'
      ? actionInput.poi_id
      : typeof actionInput.place_id === 'string'
        ? actionInput.place_id
        : undefined;
  if (!segmentId && !poiId) return undefined;
  return { segmentId, poiId };
}

export function buildTripPhysicalValidationSnapshot(
  physical: PhysicalEvaluationResult,
  input?: {
    actionInput?: Record<string, unknown> | null;
    source?: TripPhysicalValidationSnapshot['source'];
  },
): TripPhysicalValidationSnapshot {
  const context = extractPhysicalContextFromActionInput(input?.actionInput);
  return {
    violations: physical.violations,
    evaluatedAt: physical.evaluated_at,
    validatorVersion: physical.validator_version,
    ruleBundleId: physical.rule_bundle_id,
    blocking: physical.blocking,
    ...(context ? { context: { ...context, evaluatedAt: physical.evaluated_at } } : {}),
    ...(input?.source ? { source: input.source } : {}),
    ...(physical.experience_fulfillment
      ? { experienceFulfillment: physical.experience_fulfillment }
      : {}),
  };
}

export function extractTripPhysicalValidationSnapshot(
  metadata: unknown,
): TripPhysicalValidationSnapshot | undefined {
  if (!metadata || typeof metadata !== 'object') return undefined;
  const raw = (metadata as Record<string, unknown>)[TRIP_PHYSICAL_VALIDATION_METADATA_KEY];
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return undefined;
  const snap = raw as TripPhysicalValidationSnapshot;
  if (!Array.isArray(snap.violations) || typeof snap.evaluatedAt !== 'string') return undefined;
  return snap;
}

export function mergeTripPhysicalValidationSnapshot(
  metadata: unknown,
  snapshot: TripPhysicalValidationSnapshot,
): Prisma.InputJsonValue {
  const base =
    metadata && typeof metadata === 'object' && !Array.isArray(metadata)
      ? { ...(metadata as Record<string, unknown>) }
      : {};
  base[TRIP_PHYSICAL_VALIDATION_METADATA_KEY] = snapshot;
  return base as unknown as Prisma.InputJsonValue;
}
