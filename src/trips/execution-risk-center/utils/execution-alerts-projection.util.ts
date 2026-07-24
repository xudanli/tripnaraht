/**
 * Shared execution-alerts projection helpers (ERC canonical).
 */

import type { ActiveRisk, ExecutionGate, RiskLevel } from '../types/execution-risk.types';
import type { ExecutionAlertLevel } from '../../../mobile/dto/mobile-execution.types';
import { formatClockLabel } from '../../../common/utils/format-clock-label.util';
import {
  alertLevelSortWeight,
  isExecutionAlertEligibleRisk,
  isScheduleTightnessRisk,
} from './execution-intervention.projection.util';

export { alertLevelSortWeight, isExecutionAlertEligibleRisk, isScheduleTightnessRisk };

export function executionGateToAlertLevel(
  gate?: ExecutionGate,
  level?: RiskLevel,
): ExecutionAlertLevel {
  if (gate === 'STOP') return 'STOP';
  if (gate === 'REPLAN_REQUIRED') return 'REPLAN_REQUIRED';
  if (level === 'CRITICAL' || level === 'HIGH') return 'REPLAN_REQUIRED';
  return 'AT_RISK';
}

export function buildAffectedRouteLabel(risk: ActiveRisk): string | undefined {
  const segments = risk.affectedRouteSegments.map((s) => s.label).filter(Boolean);
  if (segments.length > 0) return segments.join(' → ');
  const locations = risk.affectedLocations.map((l) => l.label).filter(Boolean);
  if (locations.length >= 2) return locations.join(' → ');
  return undefined;
}

export function buildAlertImpactSummary(risk: ActiveRisk): string {
  const parts: string[] = [];
  if (risk.type === 'ENVIRONMENT') {
    const envSource = risk.sourceRefs.find((s) => s.sourceSystem === 'ENVIRONMENT_EVENT');
    if (envSource) parts.push(`weather · ${risk.level === 'CRITICAL' ? 'red' : 'yellow'}`);
  }
  if (risk.affectedActivities.length > 0) {
    const labels = [...new Set(risk.affectedActivities.map((a) => a.label).filter(Boolean))];
    parts.push(`影响活动：${labels.join('、')}`);
  }
  if (risk.impactStartAt) {
    const end = risk.impactEndAt ? `—${formatTimeLabel(risk.impactEndAt)}` : ' 起';
    parts.push(`影响时段：${formatTimeLabel(risk.impactStartAt)}${end}`);
  }
  if (parts.length === 0) return risk.summary;
  return parts.join('；');
}

function formatTimeLabel(iso: string): string {
  return formatClockLabel(iso, { emptyLabel: iso });
}
