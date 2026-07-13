import type {
  EnvironmentEventDetail,
  EnvironmentEventSummary,
} from '../../in-trip-execution/types/environment-event.types';
import type {
  ActiveRiskCode,
  ActiveRiskType,
  ExecutionGate,
  RiskLifecycleStatus,
  RiskLevel,
  RiskSourceProjection,
} from '../types/execution-risk.types';
import {
  buildMetricsFromEnvironmentCopy,
  mergeMetricBags,
} from '../knowledge/risk-metric-extraction.util';
import { buildOfficialWarningMetrics } from '../knowledge/official-warning-metric.util';
import { parseImpactWindowFromDescription } from '../utils/environment-impact-window.util';
import { buildRiskKey, deriveRiskId } from '../utils/risk-key.util';
import { gateFromLevel } from '../utils/risk-level.util';

const SOURCE_PRIORITY = 30;

export function projectEnvironmentEventToRisk(
  event: EnvironmentEventSummary | EnvironmentEventDetail,
  opts?: {
    validUntil?: string;
    impactStartAt?: string;
    impactEndAt?: string;
    referenceDate?: string;
    /** Live aggregation refresh — drives alert observedAt without mutating event.detectedAt */
    evaluatedAt?: string;
  },
): RiskSourceProjection {
  const parsedWindow =
    opts?.impactStartAt || opts?.impactEndAt
      ? { impactStartAt: opts.impactStartAt, impactEndAt: opts.impactEndAt }
      : parseImpactWindowFromDescription(event.description, opts?.referenceDate);

  const { type, code } = classifyEnvironmentEvent(event);
  const level = severityToLevel(event.severity);
  const lifecycleStatus = environmentStatusToLifecycle(event.status);
  const primaryActivity = extractPrimaryActivity(event);
  const subject = primaryActivity?.id ?? event.type;
  const riskKey = buildRiskKey({
    tripId: event.tripId,
    type,
    code,
    normalizedSubject: subject,
    affectedScope: primaryActivity?.id ?? 'trip',
    impactStartAt: parsedWindow.impactStartAt,
    impactEndAt: parsedWindow.impactEndAt,
  });

  const affectedActivities =
    'affectedItems' in event && event.affectedItems?.length
      ? event.affectedItems.map((item) => ({
          id: item.itemId,
          label: item.itemName,
          kind: 'activity' as const,
        }))
      : primaryActivity
        ? [primaryActivity]
        : [];

  const recommendationIds =
    'alternativePlans' in event
      ? (event.alternativePlans ?? []).map((p) => `env-rec-${event.id}-${p.planId}`)
      : [];

  const observedMetrics = mergeMetricBags(
    buildMetricsFromEnvironmentCopy(event.description),
    buildOfficialWarningMetrics(event),
  );

  return {
    riskKey,
    tripId: event.tripId,
    type,
    code,
    title: buildEnvironmentTitle(event, code),
    summary: buildEnvironmentSummary(event),
    level,
    executionGate: levelToGate(level, code),
    lifecycleStatus,
    detectedAt: event.detectedAt,
    updatedAt: opts?.evaluatedAt ?? event.detectedAt,
    impactStartAt: parsedWindow.impactStartAt,
    impactEndAt: parsedWindow.impactEndAt,
    validUntil: opts?.validUntil ?? defaultValidUntil(event),
    affectedMembers: [],
    affectedActivities,
    affectedLocations: [],
    affectedRouteSegments:
      event.type === 'traffic' ? [{ id: 'current_route', label: '当前路线', kind: 'route_segment' }] : [],
    sourceRefs: [{ sourceSystem: 'ENVIRONMENT_EVENT', sourceId: event.id }],
    evidenceRefs: [{ id: `env:${event.id}`, observedAt: event.detectedAt }],
    confidence: event.severity === 'red' ? 0.85 : 0.72,
    recommendationIds,
    interventionIds: [],
    decisionProblemIds: [],
    sourcePriority: SOURCE_PRIORITY,
    observedMetrics: Object.keys(observedMetrics).length > 0 ? observedMetrics : undefined,
    rootEventId: event.id,
  };
}

export function attachRiskId(projection: RiskSourceProjection): RiskSourceProjection & { id: string } {
  return { ...projection, id: deriveRiskId(projection.tripId, projection.riskKey) };
}

function classifyEnvironmentEvent(event: EnvironmentEventSummary): {
  type: ActiveRiskType;
  code: ActiveRiskCode;
} {
  const text = `${event.type} ${event.description}`.toLowerCase();
  if (event.type === 'traffic') {
    if (/关闭|closed|封路/.test(text)) {
      return { type: 'ROAD_TRANSPORT', code: 'ROAD_CLOSED' };
    }
    return { type: 'ROAD_TRANSPORT', code: 'ROAD_SLIPPERY' };
  }
  if (/风|wind|阵风/.test(text)) {
    return { type: 'ENVIRONMENT', code: 'WEATHER_STRONG_WIND' };
  }
  if (/雨|precip|暴雨/.test(text)) {
    return { type: 'ENVIRONMENT', code: 'WEATHER_HEAVY_RAIN' };
  }
  if (event.severity === 'red') {
    return { type: 'ENVIRONMENT', code: 'WEATHER_SEVERE' };
  }
  return { type: 'ENVIRONMENT', code: 'GENERIC' };
}

function severityToLevel(severity: EnvironmentEventSummary['severity']): RiskLevel {
  if (severity === 'red') return 'HIGH';
  if (severity === 'yellow') return 'MEDIUM';
  return 'LOW';
}

function environmentStatusToLifecycle(status: EnvironmentEventSummary['status']): RiskLifecycleStatus {
  if (status === 'resolved' || status === 'dismissed') return 'RESOLVED';
  if (status === 'voting') return 'ACTIVE';
  return 'ACTIVE';
}

function levelToGate(level: RiskLevel, code: ActiveRiskCode): ExecutionGate {
  if (code === 'ROAD_CLOSED') return 'STOP';
  if (
    (code === 'WEATHER_STRONG_WIND' || code === 'WEATHER_SEVERE' || code === 'WEATHER_HEAVY_RAIN') &&
    (level === 'HIGH' || level === 'CRITICAL')
  ) {
    return 'STOP';
  }
  return gateFromLevel(level);
}

function extractPrimaryActivity(
  event: EnvironmentEventSummary | EnvironmentEventDetail,
): { id: string; label: string; kind: 'activity' } | undefined {
  if ('affectedItems' in event && event.affectedItems?.[0]) {
    const item = event.affectedItems[0];
    return { id: item.itemId, label: item.itemName, kind: 'activity' };
  }
  return undefined;
}

function buildEnvironmentTitle(
  event: EnvironmentEventSummary,
  code: ActiveRiskCode,
): string {
  if (code === 'WEATHER_STRONG_WIND') return '强风预警';
  if (code === 'WEATHER_HEAVY_RAIN') return '降雨预警';
  if (code === 'ROAD_CLOSED') return '道路关闭';
  if (code === 'ROAD_SLIPPERY') return '路段湿滑';
  return event.description.slice(0, 40) || '环境预警';
}

function buildEnvironmentSummary(event: EnvironmentEventSummary): string {
  const text = event.description;
  if (/风|wind|阵风/.test(text) && /m\/s|风速/.test(text)) {
    return text.includes('影响') ? text : `${text}，可能影响户外活动和车辆稳定性`;
  }
  return text;
}

function defaultValidUntil(event: EnvironmentEventSummary): string | undefined {
  const end = parseImpactWindowFromDescription(event.description).impactEndAt;
  if (end) return end;
  const detected = Date.parse(event.detectedAt);
  if (Number.isNaN(detected)) return undefined;
  return new Date(detected + 6 * 60 * 60 * 1000).toISOString();
}
