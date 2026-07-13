/**
 * Legacy execution-alerts fingerprint — mirrors Mobile BFF getExecutionAlertsLegacy filters.
 */

import type { RiskSourceProjection } from '../types/execution-risk.types';
import {
  alertLevelSortWeight,
  executionGateToAlertLevel,
} from '../utils/execution-alerts-projection.util';
import type { ExecutionRiskShadowFingerprint } from './execution-risk-shadow-compare.types';

function sourceKeyOf(projection: RiskSourceProjection): string {
  const ref = projection.sourceRefs[0];
  return `${ref?.sourceSystem ?? 'UNKNOWN'}:${ref?.sourceId ?? projection.riskKey}`;
}

function legacyEligibleProjection(projection: RiskSourceProjection): boolean {
  const subject = projection.riskKey.split('|')[3] ?? '';
  if (
    projection.type === 'SCHEDULE' &&
    projection.executionGate !== 'STOP' &&
    projection.sourceRefs.some((s) => s.sourceSystem === 'DECISION_PROBLEM')
  ) {
    return false;
  }
  if (subject.includes('same_day_travel') || subject.includes('schedule_tightness')) {
    return false;
  }

  if (projection.type === 'ENVIRONMENT') {
    return projection.level === 'CRITICAL' || projection.level === 'HIGH';
  }

  if (projection.sourceRefs.some((r) => r.sourceSystem === 'ATTENTION_QUEUE')) {
    return projection.level === 'CRITICAL' || projection.level === 'HIGH';
  }

  if (projection.sourceRefs.some((r) => r.sourceSystem === 'DECISION_PROBLEM')) {
    const gate = projection.executionGate;
    return gate === 'STOP' || gate === 'REPLAN_REQUIRED' || gate === 'AT_RISK';
  }

  return true;
}

export function buildLegacyRiskFingerprints(
  projections: RiskSourceProjection[],
): ExecutionRiskShadowFingerprint[] {
  return projections
    .filter(legacyEligibleProjection)
    .map((projection) => {
      const sourceKey = sourceKeyOf(projection);
      return {
        id: projection.sourceRefs[0]?.sourceId ?? projection.riskKey,
        sourceKey,
        level: executionGateToAlertLevel(projection.executionGate, projection.level),
        title: projection.title,
      };
    })
    .sort((a, b) => alertLevelSortWeight(a.level) - alertLevelSortWeight(b.level));
}
