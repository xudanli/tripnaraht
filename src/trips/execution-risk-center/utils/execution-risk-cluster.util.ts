/**
 * ActiveRisk[] → ExecutionRiskCluster[] — 按共同根因聚合，避免一事件多张卡。
 */

import type { ExecutionInterventionType } from '../../../mobile/dto/mobile-execution.types';
import { formatClockLabel } from '../../../common/utils/format-clock-label.util';
import type { ActiveRisk, ActiveRiskCode } from '../types/execution-risk.types';
import type {
  ExecutionRiskCluster,
  ExecutionRiskClusterSeverity,
  ExecutionRiskConsequenceImpact,
} from '../types/execution-risk-cluster.types';
import {
  aggregateExecutionAlertRisks,
  buildBannerTitle,
  extractRiskDayNumbers,
  isDerivedImpactOf,
} from './execution-alerts-aggregation.util';
import { executionGateToAlertLevel } from './execution-alerts-projection.util';
import { isScheduleTightnessRisk } from './execution-intervention.projection.util';

const ACTIONABLE_TREATMENT = new Set<ActiveRisk['treatmentStatus']>([
  'ACTION_REQUIRED',
  'DECISION_REQUIRED',
  'APPLYING',
]);

export function buildExecutionRiskClusters(risks: ActiveRisk[]): ExecutionRiskCluster[] {
  const actionable = risks.filter((r) => ACTIONABLE_TREATMENT.has(r.treatmentStatus));
  if (actionable.length === 0) return [];

  const aggregation = aggregateExecutionAlertRisks(actionable);
  const assigned = new Set<string>();
  const clusters: ExecutionRiskCluster[] = [];

  if (aggregation.primary) {
    const primary = aggregation.primary.risk;
    const related = collectRelatedRisks(primary, actionable);
    for (const r of related) assigned.add(r.id);
    clusters.push(buildClusterFromRisks(primary, related, aggregation.impacts));
  }

  for (const { risk } of aggregation.independent) {
    if (assigned.has(risk.id)) continue;
    assigned.add(risk.id);
    clusters.push(buildClusterFromRisks(risk, [risk], []));
  }

  for (const risk of actionable) {
    if (assigned.has(risk.id)) continue;
    assigned.add(risk.id);
    clusters.push(buildClusterFromRisks(risk, [risk], []));
  }

  return enrichScheduleClustersWithBookingConsequences(clusters.sort(compareClusters), actionable);
}

export function findClusterForRisk(
  clusters: ExecutionRiskCluster[],
  riskId: string,
): ExecutionRiskCluster | undefined {
  return clusters.find(
    (c) => c.primaryRiskId === riskId || c.relatedRiskIds.includes(riskId),
  );
}

export function isDerivedOnlyClusterMember(
  riskId: string,
  cluster: ExecutionRiskCluster,
): boolean {
  return riskId !== cluster.primaryRiskId && cluster.relatedRiskIds.includes(riskId);
}

export function shouldSuppressDerivedDecisionItem(input: {
  linkedRiskIds: string[];
  decisionProblemId?: string;
  clusters: ExecutionRiskCluster[];
  risks: ActiveRisk[];
}): boolean {
  const { linkedRiskIds, decisionProblemId, clusters, risks } = input;
  if (linkedRiskIds.length === 0) return false;

  for (const cluster of clusters) {
    if (decisionProblemId && cluster.decisionProblemId === decisionProblemId) {
      return false;
    }
    const primary = risks.find((r) => r.id === cluster.primaryRiskId);
    if (!primary) continue;

    const allDerived = linkedRiskIds.every((rid) => {
      const risk = risks.find((r) => r.id === rid);
      if (!risk) return false;
      return risk.id === primary.id || isDerivedImpactOf(risk, primary);
    });

    if (allDerived && linkedRiskIds.some((rid) => cluster.relatedRiskIds.includes(rid))) {
      return true;
    }
  }
  return false;
}

function collectRelatedRisks(primary: ActiveRisk, actionable: ActiveRisk[]): ActiveRisk[] {
  const related = new Map<string, ActiveRisk>();
  related.set(primary.id, primary);
  for (const risk of actionable) {
    if (risk.id === primary.id) continue;
    if (isDerivedImpactOf(risk, primary)) {
      related.set(risk.id, risk);
    }
  }
  return [...related.values()];
}

export function buildClusterFromRisks(
  primary: ActiveRisk,
  related: ActiveRisk[],
  alertImpacts: Array<{ label: string; sourceRiskId?: string; type: string }> = [],
): ExecutionRiskCluster {
  const severity = mapSeverity(primary);
  const consequenceImpacts = buildConsequenceImpacts(primary, related, alertImpacts);
  const derivedCount = related.filter(
    (r) => r.id !== primary.id && isDerivedImpactOf(r, primary),
  ).length;

  return {
    clusterId: `cluster_${primary.id}`,
    tripId: primary.tripId,
    primaryRiskId: primary.id,
    relatedRiskIds: related.map((r) => r.id),
    rootCauseCode: primary.code,
    primaryKnowledgeCode: primary.knowledgeCode,
    rootCauseKnowledgeCode: primary.knowledgeCode,
    rootEventId:
      primary.rootEventId ??
      primary.sourceRefs.find((s) => s.sourceSystem === 'ENVIRONMENT_EVENT')?.sourceId,
    suppressedDecisionCount: derivedCount,
    severity,
    affectedActivityIds: [
      ...new Set(related.flatMap((r) => r.affectedActivities.map((a) => a.id))),
    ],
    affectedMemberIds: [
      ...new Set(related.flatMap((r) => r.affectedMembers.map((m) => m.id))),
    ],
    consequenceCodes: [...new Set(related.map((r) => r.code))],
    consequenceImpacts,
    adjustmentType: resolveClusterAdjustmentType(primary, related),
    requiresUserDecision:
      primary.treatmentStatus === 'DECISION_REQUIRED' ||
      primary.decisionProblemIds.length > 0 ||
      primary.recommendationIds.length > 0,
    decisionProblemId: primary.decisionProblemIds[0],
    recommendationId: primary.recommendationIds[0],
    environmentEventId: primary.sourceRefs.find((s) => s.sourceSystem === 'ENVIRONMENT_EVENT')
      ?.sourceId,
  };
}

function buildConsequenceImpacts(
  primary: ActiveRisk,
  related: ActiveRisk[],
  alertImpacts: Array<{ label: string; sourceRiskId?: string; type: string }>,
): ExecutionRiskConsequenceImpact[] {
  const out: ExecutionRiskConsequenceImpact[] = [];
  const seen = new Set<string>();

  const add = (impact: ExecutionRiskConsequenceImpact) => {
    const key = `${impact.code}:${impact.label}`;
    if (seen.has(key)) return;
    seen.add(key);
    out.push(impact);
  };

  for (const imp of alertImpacts) {
    const source = related.find((r) => r.id === imp.sourceRiskId) ?? primary;
    add({
      code: source.code,
      label: imp.label,
      sourceRiskId: imp.sourceRiskId ?? primary.id,
    });
  }

  for (const risk of related) {
    if (risk.id === primary.id) continue;
    if (isScheduleTightnessRisk(risk) || risk.type === 'SCHEDULE') {
      add({
        code: risk.code,
        label: risk.summary || risk.title,
        sourceRiskId: risk.id,
      });
    } else if (risk.type === 'BOOKING_FULFILLMENT') {
      add({
        code: risk.code,
        label: risk.summary || `${risk.title}可能无法按时完成`,
        sourceRiskId: risk.id,
      });
    } else if (risk.type === 'ROAD_TRANSPORT') {
      add({
        code: risk.code,
        label: risk.summary || risk.title,
        sourceRiskId: risk.id,
      });
    }
  }

  if (out.length === 0 && primary.impactStartAt) {
    const end = primary.impactEndAt
      ? `${formatHm(primary.impactStartAt)}–${formatHm(primary.impactEndAt)}`
      : `${formatHm(primary.impactStartAt)} 起`;
    add({
      code: primary.code,
      label: `${end} 影响时段内行程需调整`,
      sourceRiskId: primary.id,
    });
  }

  return out;
}

function resolveClusterAdjustmentType(
  primary: ActiveRisk,
  related: ActiveRisk[],
): ExecutionInterventionType {
  if (primary.type === 'TEAM_COORDINATION') return 'TEAM_COORDINATION';
  if (primary.type === 'RESOURCE') return 'EXECUTION_PREPARATION';
  if (primary.type === 'MEMBER_STATE' && primary.executionGate === 'STOP') {
    return 'SAFETY_INTERVENTION';
  }
  if (
    primary.executionGate === 'STOP' ||
    primary.level === 'CRITICAL' ||
    primary.code === 'WEATHER_STRONG_WIND' ||
    primary.code === 'ROAD_CLOSED'
  ) {
    return 'SAFETY_INTERVENTION';
  }
  if (
    related.some((r) => isScheduleTightnessRisk(r) || r.type === 'BOOKING_FULFILLMENT') &&
    primary.type === 'ENVIRONMENT'
  ) {
    return 'SAFETY_INTERVENTION';
  }
  if (primary.type === 'MEMBER_STATE') return 'DYNAMIC_REPLAN';
  return 'DYNAMIC_REPLAN';
}

function mapSeverity(primary: ActiveRisk): ExecutionRiskClusterSeverity {
  const level = executionGateToAlertLevel(primary.executionGate, primary.level);
  if (level === 'STOP') return 'STOP';
  if (level === 'REPLAN_REQUIRED') return 'REPLAN_REQUIRED';
  return 'AT_RISK';
}

export function buildClusterTitle(primary: ActiveRisk): string {
  if (primary.code === 'WEATHER_STRONG_WIND') {
    const route =
      primary.affectedRouteSegments[0]?.label ??
      primary.affectedActivities[0]?.label ??
      '当前行程';
    return `强风影响${route.includes('行程') ? '' : ' '}${route}`;
  }
  if (primary.code === 'ROAD_CLOSED') {
    return buildBannerTitle(primary);
  }
  return buildBannerTitle(primary);
}

export function buildClusterHeadline(primary: ActiveRisk): string {
  const route =
    primary.affectedRouteSegments.map((s) => s.label).join(' → ') ||
    primary.affectedActivities[0]?.label;
  if (primary.code === 'WEATHER_STRONG_WIND' && route) {
    return `${route}预计出现强风，驾驶安全性和后续时间安排都会受到影响`;
  }
  return primary.summary;
}

function formatHm(iso: string): string {
  return formatClockLabel(iso, { emptyLabel: iso });
}

function compareClusters(a: ExecutionRiskCluster, b: ExecutionRiskCluster): number {
  const sev = { STOP: 0, REPLAN_REQUIRED: 1, AT_RISK: 2 };
  const ds = sev[a.severity] - sev[b.severity];
  if (ds !== 0) return ds;
  return a.clusterId.localeCompare(b.clusterId);
}

function isScheduleCascadeHostRisk(risk: ActiveRisk): boolean {
  return (
    isScheduleTightnessRisk(risk) ||
    risk.type === 'SCHEDULE' ||
    /同日交通|偏紧|延误/i.test(risk.title)
  );
}

function isBookingWindowRisk(risk: ActiveRisk): boolean {
  const dp =
    risk.decisionProblemIds[0] ??
    risk.sourceRefs.find((s) => s.sourceSystem === 'DECISION_PROBLEM')?.sourceId;
  return (
    risk.type === 'BOOKING_FULFILLMENT' ||
    risk.code === 'BOOKING_WINDOW_AT_RISK' ||
    /午餐窗|午餐/i.test(risk.title) ||
    /meal_late_arrival|meal_windo/i.test(dp ?? '')
  );
}

function sharesScheduleCascadeScope(host: ActiveRisk, booking: ActiveRisk): boolean {
  const hostDays = extractRiskDayNumbers(host);
  const bookingDays = extractRiskDayNumbers(booking);
  if (hostDays.length > 0 && bookingDays.length > 0) {
    return hostDays.some((d) => bookingDays.includes(d));
  }
  const hostActivityIds = new Set(host.affectedActivities.map((a) => a.id));
  return booking.affectedActivities.some((a) => hostActivityIds.has(a.id));
}

/** Attach same-day booking consequences to schedule host clusters for auditable high-severity folds. */
function enrichScheduleClustersWithBookingConsequences(
  clusters: ExecutionRiskCluster[],
  risks: ActiveRisk[],
): ExecutionRiskCluster[] {
  const bookingRisks = risks.filter(isBookingWindowRisk);

  return clusters.map((cluster) => {
    const primary = risks.find((r) => r.id === cluster.primaryRiskId);
    if (!primary || !isScheduleCascadeHostRisk(primary) || bookingRisks.length === 0) {
      return cluster;
    }

    const relatedBookings = bookingRisks.filter(
      (b) =>
        b.tripId === primary.tripId &&
        (sharesScheduleCascadeScope(primary, b) ||
          (isScheduleCascadeHostRisk(primary) && isBookingWindowRisk(b))),
    );
    if (relatedBookings.length === 0) return cluster;

    const consequenceImpacts = [...cluster.consequenceImpacts];
    const seen = new Set(consequenceImpacts.map((c) => `${c.code}:${c.label}`));
    const consequenceCodes = new Set(cluster.consequenceCodes);

    for (const booking of relatedBookings) {
      const label = booking.summary || `${booking.title}可能无法按时完成`;
      const key = `${booking.code}:${label}`;
      if (seen.has(key)) continue;
      seen.add(key);
      consequenceImpacts.push({
        code: booking.code,
        label,
        sourceRiskId: booking.id,
      });
      consequenceCodes.add(booking.code);
    }

    return {
      ...cluster,
      consequenceImpacts,
      consequenceCodes: [...consequenceCodes],
    };
  });
}
