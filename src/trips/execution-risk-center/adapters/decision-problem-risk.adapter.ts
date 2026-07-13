import type { UnifiedDecisionProblemListItem } from '../../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import type {
  ActiveRiskCode,
  ActiveRiskType,
  RiskLifecycleStatus,
  RiskLevel,
  RiskSourceProjection,
} from '../types/execution-risk.types';
import { buildRiskKey } from '../utils/risk-key.util';
import { gateFromLevel } from '../utils/risk-level.util';

const SOURCE_PRIORITY = 50;

export function projectDecisionProblemToRisk(item: UnifiedDecisionProblemListItem): RiskSourceProjection {
  const { type, code } = classifyDecisionProblem(item);
  const level = enforcementToLevel(item.enforcement);
  const lifecycleStatus = workflowToLifecycle(item.workflowStatus);
  const scopeLabel = item.impactScopeView?.arrangements?.[0]?.label ?? item.instanceKey;
  const scopeId = item.impactScopeView?.arrangements?.[0]?.dayIndex?.toString() ?? item.instanceKey;

  const riskKey = buildRiskKey({
    tripId: item.scope.tripId,
    type,
    code,
    normalizedSubject: item.semanticKey,
    affectedScope: scopeId,
  });

  const affectedMembers = (item.scope.memberIds ?? []).map((id) => ({
    id,
    label: id,
    kind: 'member' as const,
  }));

  return {
    riskKey,
    tripId: item.scope.tripId,
    type,
    code,
    title: item.title,
    summary: item.summary,
    level,
    executionGate: enforcementToGate(item.enforcement),
    lifecycleStatus,
    detectedAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    affectedMembers,
    affectedActivities: (item.impactScopeView?.arrangements ?? []).map((a) => ({
      id: `day-${a.dayIndex}`,
      label: a.label,
      kind: 'activity' as const,
    })),
    affectedLocations: [],
    affectedRouteSegments: [],
    sourceRefs: [{ sourceSystem: 'DECISION_PROBLEM', sourceId: item.problemId }],
    evidenceRefs: item.detectors.flatMap((d) =>
      (d.sourceRefIds ?? []).map((id) => ({ id })),
    ),
    confidence: item.evidenceSummary.confidence,
    recommendationIds: [],
    interventionIds: [],
    decisionProblemIds: [item.problemId],
    sourcePriority: SOURCE_PRIORITY,
    observedMetrics:
      code === 'ROAD_CLOSED'
        ? { ROAD_STATUS: 'CLOSED_CONFIRMED' }
        : code === 'MEMBER_DRIVER_FATIGUE'
          ? extractDriverFatigueMetrics(item)
          : undefined,
  };
}

function extractDriverFatigueMetrics(
  item: UnifiedDecisionProblemListItem,
): Record<string, number> | undefined {
  const text = `${item.summary} ${item.title}`;
  const match = text.match(/(\d+(?:\.\d+)?)\s*(?:小时|hours?)/i);
  if (!match) return undefined;
  const hours = Number(match[1]);
  return Number.isFinite(hours) ? { CONTINUOUS_DRIVING_HOURS: hours } : undefined;
}

function classifyDecisionProblem(item: UnifiedDecisionProblemListItem): {
  type: ActiveRiskType;
  code: ActiveRiskCode;
} {
  const key = `${item.semanticKey} ${item.title}`.toLowerCase();
  if (/road|封路|closed|f-road|road_segment/.test(key)) {
    return { type: 'ROAD_TRANSPORT', code: 'ROAD_CLOSED' };
  }
  if (/weather|风|强风|weather_activity|prohibited/.test(key)) {
    return { type: 'ENVIRONMENT', code: 'WEATHER_SEVERE' };
  }
  if (/fatigue|疲劳|driving|驾驶/.test(key)) {
    return { type: 'MEMBER_STATE', code: 'MEMBER_DRIVER_FATIGUE' };
  }
  if (/schedule|delay|延误|tight/.test(key)) {
    return { type: 'SCHEDULE', code: 'SCHEDULE_DELAY' };
  }
  if (/booking|预约/.test(key)) {
    return { type: 'BOOKING_FULFILLMENT', code: 'BOOKING_WINDOW_AT_RISK' };
  }
  return { type: 'SCHEDULE', code: 'GENERIC' };
}

function enforcementToLevel(enforcement: UnifiedDecisionProblemListItem['enforcement']): RiskLevel {
  if (enforcement === 'BLOCK') return 'CRITICAL';
  if (enforcement === 'REQUIRE_ADJUSTMENT') return 'HIGH';
  return 'MEDIUM';
}

function enforcementToGate(enforcement: UnifiedDecisionProblemListItem['enforcement']) {
  if (enforcement === 'BLOCK') return 'STOP' as const;
  if (enforcement === 'REQUIRE_ADJUSTMENT') return 'REPLAN_REQUIRED' as const;
  return gateFromLevel(enforcementToLevel(enforcement));
}

function workflowToLifecycle(status: UnifiedDecisionProblemListItem['workflowStatus']): RiskLifecycleStatus {
  if (status === 'RESOLVED' || status === 'DISMISSED') return 'RESOLVED';
  if (status === 'OPEN') return 'ACTIVE';
  return 'ACTIVE';
}
