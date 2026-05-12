/**
 * Assemble DecisionContext from an existing Reality snapshot + trip horizon.
 */

import type { TripContextState } from '../decision/world-model';
import {
  DECISION_CONTEXT_SCHEMA_V0,
  type DecisionContextV0,
  type PlanningHorizonIso,
} from './decision-context.types';
import { getDefaultRealityReadPolicy } from './reality-enforcement.env';
import type { RealitySnapshotV0 } from './reality-snapshot.types';

function addDaysIso(isoDate: string, days: number): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => Number.isNaN(n))) return isoDate;
  const [y, mo, da] = parts;
  const dt = new Date(Date.UTC(y, mo - 1, da));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

export function computePlanningHorizonFromTripContext(context: TripContextState): PlanningHorizonIso {
  const start_at = `${context.startDate}T00:00:00.000Z`;
  const lastDay = addDaysIso(context.startDate, Math.max(0, context.durationDays - 1));
  const end_at = `${lastDay}T23:59:59.999Z`;
  return { start_at, end_at };
}

export function buildDecisionContextV0(
  snapshot: RealitySnapshotV0,
  planning_horizon: PlanningHorizonIso,
): DecisionContextV0 {
  return {
    schema: DECISION_CONTEXT_SCHEMA_V0,
    snapshot_id: snapshot.snapshot_id,
    reality: snapshot,
    planning_horizon,
    enforcement: 'bound_v0',
    read_policy: getDefaultRealityReadPolicy(),
  };
}
