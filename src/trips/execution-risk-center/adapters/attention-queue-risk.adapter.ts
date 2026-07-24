import type { AttentionItemDto } from '../../dto/attention-queue.dto';
import { AttentionItemType, AttentionSeverity } from '../../dto/attention-queue.dto';
import type {
  ActiveRiskCode,
  ActiveRiskType,
  RiskLifecycleStatus,
  RiskLevel,
  RiskSourceProjection,
} from '../types/execution-risk.types';
import { buildRiskKey } from '../utils/risk-key.util';
import { gateFromLevel } from '../utils/risk-level.util';

const SOURCE_PRIORITY = 10;

export function projectAttentionItemToRisk(item: AttentionItemDto): RiskSourceProjection {
  const { type, code } = classifyAttentionItem(item);
  const level = severityToLevel(item.severity);
  const dayScope = item.metadata?.day != null ? `day-${item.metadata.day}` : 'trip';
  const riskKey = buildRiskKey({
    tripId: item.tripId,
    type,
    code,
    normalizedSubject: item.type,
    affectedScope: dayScope,
  });

  return {
    riskKey,
    tripId: item.tripId,
    type,
    code,
    title: item.title,
    summary: item.description ?? item.title,
    level,
    executionGate: gateFromLevel(level),
    lifecycleStatus: attentionStatusToLifecycle(item.status),
    detectedAt: item.createdAt,
    updatedAt: item.updatedAt ?? item.createdAt,
    affectedMembers: [],
    affectedActivities:
      item.metadata?.day != null
        ? [{ id: dayScope, label: `Day ${item.metadata.day}`, kind: 'activity' }]
        : [],
    affectedLocations: [],
    affectedRouteSegments: [],
    sourceRefs: [{ sourceSystem: 'ATTENTION_QUEUE', sourceId: item.id }],
    evidenceRefs: (item.metadata?.evidenceIds ?? []).map((id) => ({
      id,
      observedAt: item.createdAt,
    })),
    recommendationIds: [],
    interventionIds: [],
    decisionProblemIds: [],
    sourcePriority: SOURCE_PRIORITY,
  };
}

function classifyAttentionItem(item: AttentionItemDto): {
  type: ActiveRiskType;
  code: ActiveRiskCode;
} {
  switch (item.type) {
    case AttentionItemType.WEATHER_RISK:
      return { type: 'ENVIRONMENT', code: 'WEATHER_SEVERE' };
    case AttentionItemType.ROAD_CLOSED:
      return { type: 'ROAD_TRANSPORT', code: 'ROAD_CLOSED' };
    case AttentionItemType.SOS:
      return { type: 'ENVIRONMENT', code: 'WEATHER_SEVERE' };
    case AttentionItemType.SAFETY_RISK:
      return { type: 'ENVIRONMENT', code: 'WEATHER_SEVERE' };
    case AttentionItemType.BOOKING_ISSUE:
      return { type: 'BOOKING_FULFILLMENT', code: 'BOOKING_WINDOW_AT_RISK' };
    case AttentionItemType.SCHEDULE_CONFLICT:
      return { type: 'SCHEDULE', code: 'SCHEDULE_DELAY' };
    default:
      return { type: 'SCHEDULE', code: 'GENERIC' };
  }
}

function severityToLevel(severity: AttentionSeverity): RiskLevel {
  switch (severity) {
    case AttentionSeverity.CRITICAL:
      return 'CRITICAL';
    case AttentionSeverity.HIGH:
      return 'HIGH';
    case AttentionSeverity.MEDIUM:
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

function attentionStatusToLifecycle(status?: AttentionItemDto['status']): RiskLifecycleStatus {
  if (status === 'resolved') return 'RESOLVED';
  return 'ACTIVE';
}
