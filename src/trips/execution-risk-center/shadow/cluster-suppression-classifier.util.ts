/**
 * Classify why a suppressed cluster is hidden — cutover-safe, auditable folding rules.
 */

import type { ActiveRisk } from '../types/execution-risk.types';
import type { ExecutionRiskCluster, ExecutionRiskClusterSeverity } from '../types/execution-risk-cluster.types';
import type { ClusterSuppressionReason } from './cluster-visibility-audit.types';
import {
  extractRiskDayNumbers,
  isDerivedImpactOf,
  isScheduleDerivedFromPrimary,
} from '../utils/execution-alerts-aggregation.util';
import { isScheduleTightnessRisk } from '../utils/execution-intervention.projection.util';

export interface ClusterSuppressionClassification {
  reason: ClusterSuppressionReason;
  representedByClusterId?: string;
}

const SEVERITY_RANK: Record<ExecutionRiskClusterSeverity, number> = {
  STOP: 0,
  REPLAN_REQUIRED: 1,
  AT_RISK: 2,
};

function clusterPrimary(
  cluster: ExecutionRiskCluster,
  risks: ActiveRisk[],
): ActiveRisk | undefined {
  return risks.find((r) => r.id === cluster.primaryRiskId);
}

function sharesAffectedScope(a: ActiveRisk, b: ActiveRisk): boolean {
  const ids = new Set(
    [...a.affectedActivities, ...a.affectedRouteSegments, ...a.affectedLocations].map((x) => x.id),
  );
  return [...b.affectedActivities, ...b.affectedRouteSegments, ...b.affectedLocations].some((x) =>
    ids.has(x.id),
  );
}

function sharesSameDay(a: ActiveRisk, b: ActiveRisk): boolean {
  const daysA = extractRiskDayNumbers(a);
  const daysB = extractRiskDayNumbers(b);
  if (daysA.length === 0 || daysB.length === 0) return false;
  return daysA.some((d) => daysB.includes(d));
}

function decisionProblemIdOf(risk: ActiveRisk): string | undefined {
  return (
    risk.decisionProblemIds[0] ??
    risk.sourceRefs.find((s) => s.sourceSystem === 'DECISION_PROBLEM')?.sourceId
  );
}

export function decisionProblemFamily(problemId?: string): string | undefined {
  if (!problemId) return undefined;
  if (problemId.includes('same_day_travel')) return 'same_day_travel';
  if (/meal_late_arrival|meal_windo/i.test(problemId)) return 'meal_late_arrival';
  return problemId;
}

function isMealLateArrivalRisk(risk: ActiveRisk): boolean {
  const dp = decisionProblemIdOf(risk);
  return decisionProblemFamily(dp) === 'meal_late_arrival' || /午餐窗|午餐/i.test(risk.title);
}

function isBookingWindowRisk(risk: ActiveRisk): boolean {
  return (
    risk.type === 'BOOKING_FULFILLMENT' ||
    risk.code === 'BOOKING_WINDOW_AT_RISK' ||
    isMealLateArrivalRisk(risk) ||
    /午餐|预约窗|booking/i.test(risk.title)
  );
}

function isScheduleCascadeHostRisk(risk: ActiveRisk): boolean {
  return (
    risk.type === 'SCHEDULE' ||
    isScheduleTightnessRisk(risk) ||
    /同日交通|schedule|延误|偏紧/i.test(risk.title)
  );
}

function sharesTripScheduleCascadeScope(suppressed: ActiveRisk, host: ActiveRisk): boolean {
  if (suppressed.tripId !== host.tripId) return false;
  const hostFamily = decisionProblemFamily(decisionProblemIdOf(host));
  const suppressedFamily = decisionProblemFamily(decisionProblemIdOf(suppressed));
  if (hostFamily === 'same_day_travel' && suppressedFamily === 'meal_late_arrival') {
    return true;
  }
  if (isMealLateArrivalRisk(suppressed) && isScheduleCascadeHostRisk(host)) {
    return true;
  }
  return false;
}

function isEnvironmentScheduleCascadeDerived(
  suppressedPrimary: ActiveRisk,
  hostPrimary: ActiveRisk,
): boolean {
  return (
    hostPrimary.type === 'ENVIRONMENT' &&
    (hostPrimary.executionGate === 'STOP' || hostPrimary.executionGate === 'REPLAN_REQUIRED') &&
    (isScheduleCascadeHostRisk(suppressedPrimary) ||
      isScheduleTightnessRisk(suppressedPrimary) ||
      isMealLateArrivalRisk(suppressedPrimary)) &&
    suppressedPrimary.tripId === hostPrimary.tripId
  );
}

function requiredActionRank(severity: ExecutionRiskClusterSeverity): number {
  return severity === 'STOP' ? 0 : severity === 'REPLAN_REQUIRED' ? 1 : 2;
}

export function highSeverityFoldSafe(input: {
  suppressedSeverity: ExecutionRiskClusterSeverity;
  hostSeverity: ExecutionRiskClusterSeverity;
  hostCluster: ExecutionRiskCluster;
  suppressedPrimary: ActiveRisk;
}): boolean {
  if (SEVERITY_RANK[input.hostSeverity] > SEVERITY_RANK[input.suppressedSeverity]) {
    return false;
  }
  if (requiredActionRank(input.hostSeverity) > requiredActionRank(input.suppressedSeverity)) {
    return false;
  }
  return hostCoversSuppressedConsequence(input.hostCluster, input.suppressedPrimary);
}

function hostCoversSuppressedConsequence(
  hostCluster: ExecutionRiskCluster,
  suppressedPrimary: ActiveRisk,
): boolean {
  const labels = hostCluster.consequenceImpacts.map((c) => c.label.toLowerCase());
  const suppressedLabel = (suppressedPrimary.summary || suppressedPrimary.title).toLowerCase();

  if (labels.some((l) => l.includes(suppressedLabel) || suppressedLabel.includes(l))) {
    return true;
  }

  if (isBookingWindowRisk(suppressedPrimary) || isMealLateArrivalRisk(suppressedPrimary)) {
    return (
      labels.some(
        (l) =>
          /午餐|预约|booking|meal|顺延|调整|活动|无法按时|交通|偏紧|行程/.test(l) ||
          hostCluster.consequenceCodes.includes('BOOKING_WINDOW_AT_RISK') ||
          hostCluster.consequenceCodes.includes('SCHEDULE_DELAY'),
      ) ||
      (hostCluster.requiresUserDecision && hostCluster.severity !== 'AT_RISK')
    );
  }

  if (isScheduleCascadeHostRisk(suppressedPrimary) || isScheduleTightnessRisk(suppressedPrimary)) {
    return (
      hostCluster.consequenceCodes.includes('SCHEDULE_DELAY') ||
      hostCluster.consequenceCodes.includes(suppressedPrimary.code) ||
      labels.some((l) => /交通|偏紧|行程|延误|schedule/i.test(l)) ||
      (hostCluster.requiresUserDecision && hostCluster.severity !== 'AT_RISK')
    );
  }

  if (isScheduleTightnessRisk(suppressedPrimary) || suppressedPrimary.type === 'SCHEDULE') {
    return (
      hostCluster.consequenceCodes.includes(suppressedPrimary.code) ||
      labels.some((l) => /交通|行程|schedule|延误|偏紧/.test(l))
    );
  }

  return hostCluster.relatedRiskIds.includes(suppressedPrimary.id);
}

function isDuplicateScheduleProjection(
  suppressed: ExecutionRiskCluster,
  suppressedPrimary: ActiveRisk,
  host: ExecutionRiskCluster,
  hostPrimary: ActiveRisk,
): boolean {
  if (suppressedPrimary.title !== hostPrimary.title) return false;
  if (!isScheduleCascadeHostRisk(hostPrimary)) return false;
  if (!(isScheduleCascadeHostRisk(suppressedPrimary) || isScheduleTightnessRisk(suppressedPrimary))) {
    return false;
  }

  const famA = decisionProblemFamily(decisionProblemIdOf(suppressedPrimary));
  const famB = decisionProblemFamily(decisionProblemIdOf(hostPrimary));
  const sameDayFamily =
    famA === 'same_day_travel' ||
    famB === 'same_day_travel' ||
    (/同日交通|same_day_travel/i.test(suppressedPrimary.title) &&
      /同日交通|same_day_travel/i.test(hostPrimary.title));
  if (!sameDayFamily) return false;

  return (
    sharesSameDay(suppressedPrimary, hostPrimary) ||
    sharesAffectedScope(suppressedPrimary, hostPrimary) ||
    suppressed.decisionProblemId === host.decisionProblemId
  );
}

function isFoldableLunchWindowDuplicate(
  suppressed: ExecutionRiskCluster,
  suppressedPrimary: ActiveRisk,
  host: ExecutionRiskCluster,
  hostPrimary: ActiveRisk,
): boolean {
  if (!isBookingWindowRisk(suppressedPrimary)) return false;
  if (!isScheduleCascadeHostRisk(hostPrimary)) return false;

  const sharesScope =
    sharesSameDay(suppressedPrimary, hostPrimary) ||
    sharesAffectedScope(suppressedPrimary, hostPrimary) ||
    sharesTripScheduleCascadeScope(suppressedPrimary, hostPrimary);
  if (!sharesScope) return false;

  const suppressedDp = decisionProblemIdOf(suppressedPrimary);
  if (decisionProblemFamily(suppressedDp) !== 'meal_late_arrival' && !/午餐/.test(suppressedPrimary.title)) {
    return false;
  }

  if (
    !highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    })
  ) {
    return false;
  }

  return true;
}

function isDuplicateDecisionFold(
  suppressed: ExecutionRiskCluster,
  suppressedPrimary: ActiveRisk,
  host: ExecutionRiskCluster,
  hostPrimary: ActiveRisk,
): boolean {
  if (host.clusterId === suppressed.clusterId) return false;

  if (
    suppressed.decisionProblemId &&
    host.decisionProblemId &&
    suppressed.decisionProblemId === host.decisionProblemId
  ) {
    return highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    });
  }

  if (isDuplicateScheduleProjection(suppressed, suppressedPrimary, host, hostPrimary)) {
    return highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    });
  }

  if (isFoldableLunchWindowDuplicate(suppressed, suppressedPrimary, host, hostPrimary)) {
    return true;
  }

  return false;
}

function isDerivedOnlyFold(
  suppressed: ExecutionRiskCluster,
  suppressedPrimary: ActiveRisk,
  host: ExecutionRiskCluster,
  hostPrimary: ActiveRisk,
): boolean {
  if (host.clusterId === suppressed.clusterId) return false;
  if (isDerivedImpactOf(suppressedPrimary, hostPrimary)) {
    return highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    });
  }
  if (isScheduleDerivedFromPrimary(suppressedPrimary, hostPrimary)) {
    return highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    });
  }
  if (isEnvironmentScheduleCascadeDerived(suppressedPrimary, hostPrimary)) {
    return highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    });
  }
  if (
    suppressed.rootEventId &&
    host.rootEventId &&
    suppressed.rootEventId === host.rootEventId &&
    suppressedPrimary.generationMode === 'CAUSAL_DERIVATION'
  ) {
    return highSeverityFoldSafe({
      suppressedSeverity: suppressed.severity,
      hostSeverity: host.severity,
      hostCluster: host,
      suppressedPrimary,
    });
  }
  return false;
}

function hostPriority(
  host: ExecutionRiskCluster,
  hostPrimary: ActiveRisk,
  suppressedPrimary: ActiveRisk,
): number {
  let score = SEVERITY_RANK[host.severity] * 10;
  if (isScheduleCascadeHostRisk(hostPrimary) && sharesSameDay(suppressedPrimary, hostPrimary)) {
    score -= 5;
  }
  if (isBookingWindowRisk(suppressedPrimary) && isScheduleCascadeHostRisk(hostPrimary)) {
    score -= 3;
  }
  if (hostPrimary.type === 'ENVIRONMENT') score += 2;
  return score;
}

function selectRepresentativeHost(input: {
  suppressed: ExecutionRiskCluster;
  suppressedPrimary: ActiveRisk;
  visibleClusters: ExecutionRiskCluster[];
  risks: ActiveRisk[];
  mode: 'DERIVED_ONLY' | 'DUPLICATE_DECISION';
}): ExecutionRiskCluster | undefined {
  const candidates = input.visibleClusters
    .map((host) => {
      const hostPrimary = clusterPrimary(host, input.risks);
      if (!hostPrimary) return null;
      const matches =
        input.mode === 'DERIVED_ONLY'
          ? isDerivedOnlyFold(input.suppressed, input.suppressedPrimary, host, hostPrimary)
          : isDuplicateDecisionFold(input.suppressed, input.suppressedPrimary, host, hostPrimary);
      if (!matches) return null;
      return { host, hostPrimary, priority: hostPriority(host, hostPrimary, input.suppressedPrimary) };
    })
    .filter(Boolean) as Array<{
    host: ExecutionRiskCluster;
    hostPrimary: ActiveRisk;
    priority: number;
  }>;

  candidates.sort((a, b) => a.priority - b.priority);
  return candidates[0]?.host;
}

export function classifyClusterSuppression(input: {
  cluster: ExecutionRiskCluster;
  risks: ActiveRisk[];
  visibleClusters: ExecutionRiskCluster[];
  visibleDecisionProblemIds: Set<string>;
}): ClusterSuppressionClassification {
  const primary = clusterPrimary(input.cluster, input.risks);

  if (primary?.lifecycleStatus === 'RESOLVED' || primary?.lifecycleStatus === 'MITIGATED') {
    return { reason: 'RESOLVED' };
  }

  if (primary) {
    const duplicateHost = selectRepresentativeHost({
      suppressed: input.cluster,
      suppressedPrimary: primary,
      visibleClusters: input.visibleClusters,
      risks: input.risks,
      mode: 'DUPLICATE_DECISION',
    });
    if (duplicateHost) {
      return { reason: 'DUPLICATE_DECISION', representedByClusterId: duplicateHost.clusterId };
    }

    const derivedHost = selectRepresentativeHost({
      suppressed: input.cluster,
      suppressedPrimary: primary,
      visibleClusters: input.visibleClusters,
      risks: input.risks,
      mode: 'DERIVED_ONLY',
    });
    if (derivedHost) {
      return { reason: 'DERIVED_ONLY', representedByClusterId: derivedHost.clusterId };
    }
  }

  if (
    input.cluster.decisionProblemId &&
    input.visibleDecisionProblemIds.has(input.cluster.decisionProblemId)
  ) {
    const host = input.visibleClusters.find(
      (c) => c.decisionProblemId === input.cluster.decisionProblemId,
    );
    if (host && primary) {
      const hostPrimary = clusterPrimary(host, input.risks);
      if (
        hostPrimary &&
        highSeverityFoldSafe({
          suppressedSeverity: input.cluster.severity,
          hostSeverity: host.severity,
          hostCluster: host,
          suppressedPrimary: primary,
        })
      ) {
        return { reason: 'DUPLICATE_DECISION', representedByClusterId: host.clusterId };
      }
    }
  }

  if (!input.cluster.requiresUserDecision && input.cluster.severity === 'AT_RISK') {
    return { reason: 'INFORMATIONAL_ONLY' };
  }

  if (!input.cluster.requiresUserDecision) {
    return { reason: 'NO_USER_ACTION_REQUIRED' };
  }

  return { reason: 'UNKNOWN' };
}
