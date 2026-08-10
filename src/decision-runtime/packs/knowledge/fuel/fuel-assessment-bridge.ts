/**
 * Bridge FuelAssessment ↔ P-FUEL-1 FuelReachabilitySummary for overlay / repair.
 */

import type {
  FuelReachabilitySeverity,
  FuelReachabilitySummary,
} from '../../../../trips/fuel/fuel-reachability.types';
import type { FuelAssessment, FuelAssessmentStatus } from './iceland-fuel.types';

export function fuelAssessmentStatusToSeverity(
  status: FuelAssessmentStatus,
): FuelReachabilitySeverity {
  if (status === 'BLOCK') return 'CRITICAL';
  if (status === 'WARN') return 'HIGH';
  return 'LOW';
}

export function fuelAssessmentToReachabilitySummary(
  assessment: FuelAssessment,
  opts: { legId: string; date: string },
): FuelReachabilitySummary {
  const severity = fuelAssessmentStatusToSeverity(assessment.status);
  const kmToNext =
    assessment.requiredRangeKm - assessment.reserveRangeKm;
  return {
    legId: opts.legId,
    date: opts.date,
    safeBeforeNextFuel: assessment.status === 'PASS',
    kmToNextFuel: Number.isFinite(kmToNext) ? Math.max(0, kmToNext) : Number.POSITIVE_INFINITY,
    kmToReachableFuel: Math.max(0, assessment.estimatedRangeKm),
    remainingRangeKm: assessment.estimatedRangeKm,
    effectiveRangeKm: assessment.estimatedRangeKm + assessment.reserveRangeKm,
    severity,
    recommendedStopPoiId:
      assessment.recommendedAction === 'CHANGE_STATION'
        ? assessment.nextPrimaryStation
        : assessment.nextPrimaryStation,
  };
}

/** Map assessment recommended action into repair-oriented metadata. */
export function fuelAssessmentRepairHint(assessment: FuelAssessment): {
  forceStopInsert: boolean;
  suggestStop: boolean;
  replan: boolean;
  action?: FuelAssessment['recommendedAction'];
} {
  return {
    forceStopInsert:
      assessment.status === 'BLOCK' &&
      (assessment.recommendedAction === 'REFUEL_NOW' ||
        assessment.recommendedAction === 'ADD_FUEL_STOP'),
    suggestStop: assessment.status === 'WARN',
    replan: assessment.recommendedAction === 'REPLAN_ROUTE',
    action: assessment.recommendedAction,
  };
}
