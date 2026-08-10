/**
 * INTAKE：将 trip DB 中已持久化的放宽约束回填到 TripPlanRequest
 * （apply-relaxation / TRIP_RELAXATION_PERSISTED → 下一轮 route_and_run）
 */

import type { TripPlanRequest } from '../interfaces/trip-plan.interface';
import {
  parseBudgetConfig,
  resolveBudgetIntent,
} from '../../trips/budget-os/utils/budget-config.util';
import { getConstraintsVersion } from '../../trips/trip-constraint-solver/utils/constraints-metadata.util';

export type TripRecordForRelaxationHydrate = {
  budgetConfig?: unknown;
  pacingConfig?: unknown;
  metadata?: unknown;
};

export function hydrateRelaxationConstraintsFromTripRecord(
  tripPlanRequest: TripPlanRequest,
  trip: TripRecordForRelaxationHydrate,
): string[] {
  const filled: string[] = [];
  const meta =
    trip.metadata && typeof trip.metadata === 'object'
      ? (trip.metadata as Record<string, unknown>)
      : {};
  const agentPlan = (meta.agent_plan_constraints ?? {}) as Record<string, unknown>;
  const pacing =
    trip.pacingConfig && typeof trip.pacingConfig === 'object'
      ? (trip.pacingConfig as Record<string, unknown>)
      : {};
  const budgetRaw = parseBudgetConfig(trip.budgetConfig);
  const intent = resolveBudgetIntent(budgetRaw);

  const constraints = {
    ...(tripPlanRequest.constraints ?? {}),
  } as Record<string, unknown>;

  // 行程已确认车型：metadata.constraints（决策写回）优先于 agent_plan / pacing
  const metaConstraints =
    meta.constraints && typeof meta.constraints === 'object'
      ? (meta.constraints as Record<string, unknown>)
      : {};
  const vehicleType =
    agentPlan.vehicle_type ??
    metaConstraints.vehicle_type ??
    metaConstraints.vehicleType ??
    pacing.vehicleType;
  if (
    (vehicleType === '2WD' || vehicleType === '4WD') &&
    constraints.vehicle_type == null
  ) {
    constraints.vehicle_type = vehicleType;
    filled.push('constraints.vehicle_type');
  }

  const pacingMode = agentPlan.pacing_mode ?? pacing.pacingMode ?? pacing.pacing_mode;
  if (pacingMode === 'conservative' && constraints.pacing_mode !== 'conservative') {
    constraints.pacing_mode = 'conservative';
    filled.push('constraints.pacing_mode');
  }

  if (intent?.total != null && intent.total > 0) {
    const budget = (constraints.budget as Record<string, unknown> | undefined) ?? {};
    if (budget.total == null) {
      constraints.budget = {
        ...budget,
        total: intent.total,
        currency: intent.currency ?? 'CNY',
      };
      filled.push('constraints.budget.total');
    }
  }

  if (Object.keys(constraints).length > 0) {
    tripPlanRequest.constraints = constraints as TripPlanRequest['constraints'];
  }

  const must = agentPlan.must_include_poi_ids;
  if (
    Array.isArray(must) &&
    must.length > 0 &&
    (!Array.isArray(tripPlanRequest.must_include_poi_ids) ||
      tripPlanRequest.must_include_poi_ids.length === 0)
  ) {
    tripPlanRequest.must_include_poi_ids = [...must];
    filled.push('must_include_poi_ids');
  }

  const version = getConstraintsVersion(meta);
  if (version > 0) {
    Object.assign(tripPlanRequest, { constraints_version: version });
    filled.push('constraints_version');
  }

  return filled;
}
