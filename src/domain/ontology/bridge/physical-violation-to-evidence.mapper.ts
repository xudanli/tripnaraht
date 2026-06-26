/**
 * L2 → L3 统一事件桥：PhysicalViolation → EvidenceEnvelope
 *
 * 将 PhysicalValidator 产出的结构化违规映射为 travel-cognition 级联触发器，
 * 替代 readiness blocker 文本启发式推断。
 */

import type { EvidenceEnvelope } from '../../../travel-cognition';
import { ViolationCode } from '../validator/physical-validator.constants';
import type { PhysicalViolationItem } from '../validator/physical-validator.types';

export interface PhysicalViolationEvidenceContext {
  evaluatedAt?: string;
  segmentId?: string;
  poiId?: string;
}

const CASCADE_PRIORITY: readonly string[] = [
  ViolationCode.SEGMENT_ROAD_CLOSED,
  ViolationCode.SEGMENT_SEASONALLY_CLOSED,
  ViolationCode.POI_CLOSURE,
  ViolationCode.POI_CLOSED_AT_ETA,
  ViolationCode.SEGMENT_REQUIRES_4X4,
  ViolationCode.TRAVEL_ONTOLOGY_FLIGHT_WINDOW,
  ViolationCode.TRAVEL_ONTOLOGY_FLIGHT_OVERLAP,
];

function isFroadDetail(detail: string): boolean {
  return /\bf[- ]?road\b/i.test(detail) || /\bf\d{3}\b/i.test(detail) || /高地|内陆/i.test(detail);
}

function baseConfidence(violation: PhysicalViolationItem): number {
  return violation.severity === 'BLOCK' ? 0.9 : 0.75;
}

function biTemporalFields(
  observedAt: string,
): Pick<EvidenceEnvelope, 'observedAt' | 'createdAt' | 'validAt'> {
  return {
    observedAt,
    createdAt: observedAt,
    validAt: observedAt,
  };
}

/** 单条物理违规 → 级联证据包；不可级联的违规返回 null。 */
export function physicalViolationToEvidence(
  violation: PhysicalViolationItem,
  context: PhysicalViolationEvidenceContext = {},
): EvidenceEnvelope | null {
  const now = context.evaluatedAt ?? new Date().toISOString();
  const confidence = baseConfidence(violation);
  const detail = violation.detail ?? violation.code;

  switch (violation.code) {
    case ViolationCode.SEGMENT_ROAD_CLOSED:
    case ViolationCode.SEGMENT_SEASONALLY_CLOSED:
    case ViolationCode.SEGMENT_REQUIRES_4X4: {
      const froad = isFroadDetail(detail);
      return {
        factType: 'ROAD',
        entityRef: {
          kind: 'ROAD',
          id: context.segmentId ?? `physical:${violation.code}`,
          label: detail.slice(0, 80),
        },
        value: {
          isOpen: violation.code === ViolationCode.SEGMENT_REQUIRES_4X4 ? undefined : false,
          riskLevel: violation.severity === 'BLOCK' ? 3 : 2,
          reason: detail,
          metadata: {
            violationCode: violation.code,
            isFroad: froad,
            evidenceSource: violation.evidence_source,
            requires4x4: violation.code === ViolationCode.SEGMENT_REQUIRES_4X4,
          },
        },
        source: 'physical_validator',
        ...biTemporalFields(now),
        confidence,
      };
    }

    case ViolationCode.POI_CLOSURE:
    case ViolationCode.POI_CLOSED_AT_ETA:
      return {
        factType: 'OPENING_HOURS',
        entityRef: {
          kind: 'POI',
          id: context.poiId ?? `physical:${violation.code}`,
          label: detail.slice(0, 80),
        },
        value: {
          isOpen: false,
          reason: detail,
          metadata: { violationCode: violation.code },
        },
        source: 'physical_validator',
        ...biTemporalFields(now),
        confidence,
      };

    case ViolationCode.TRAVEL_ONTOLOGY_FLIGHT_WINDOW:
    case ViolationCode.TRAVEL_ONTOLOGY_FLIGHT_OVERLAP:
      return {
        factType: 'FLIGHT_STATUS',
        entityRef: {
          kind: 'AIRPORT',
          id: 'physical:flight-constraint',
          label: 'Flight schedule constraint',
        },
        value: {
          status: 'DELAYED',
          reason: detail,
          metadata: { violationCode: violation.code },
        },
        source: 'physical_validator',
        ...biTemporalFields(now),
        confidence: confidence * 0.9,
      };

    default:
      return null;
  }
}

/** 从违规列表中选取最高优先级、可级联的 EvidenceEnvelope。 */
export function resolveCascadeTriggerFromPhysicalViolations(
  violations: PhysicalViolationItem[],
  context: PhysicalViolationEvidenceContext = {},
): EvidenceEnvelope | null {
  if (!violations.length) return null;

  for (const code of CASCADE_PRIORITY) {
    const match = violations.find((v) => v.code === code);
    if (!match) continue;
    const envelope = physicalViolationToEvidence(match, context);
    if (envelope) return envelope;
  }

  for (const violation of violations) {
    const envelope = physicalViolationToEvidence(violation, context);
    if (envelope) return envelope;
  }

  return null;
}
