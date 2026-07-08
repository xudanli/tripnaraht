/**
 * In-trip recovery ↔ ReplanningTriggerPolicy integration.
 */

import type { ReplanningAction } from './replanning-trigger.policy';

export type InTripTriggerType =
  | 'CONSTRAINT_CHANGED'
  | 'ITINERARY_CHANGED'
  | 'BLOCKER_DETECTED'
  | 'MANUAL'
  | 'LIFECYCLE_PLANNING'
  | 'WEATHER_ALERT'
  | 'ROAD_CLOSED'
  | 'TRAFFIC_DELAY'
  | 'LATE_DEPARTURE'
  | 'ENVIRONMENT_DETECTED';

export function inferInTripEventSeverity(
  triggerType: InTripTriggerType,
): 'LOW' | 'MEDIUM' | 'HIGH' {
  switch (triggerType) {
    case 'ROAD_CLOSED':
    case 'WEATHER_ALERT':
    case 'MANUAL':
      return 'HIGH';
    case 'TRAFFIC_DELAY':
    case 'LATE_DEPARTURE':
    case 'BLOCKER_DETECTED':
    case 'ITINERARY_CHANGED':
    case 'CONSTRAINT_CHANGED':
      return 'MEDIUM';
    default:
      return 'LOW';
  }
}

/** In-trip loop is the LOCAL_REPAIR / PARTIAL_REPLAN execution path */
export function shouldRunInTripRecovery(
  action: ReplanningAction,
  options?: { force?: boolean; manual?: boolean },
): boolean {
  if (options?.force || options?.manual) return true;
  return action === 'LOCAL_REPAIR' || action === 'PARTIAL_REPLAN';
}

export function shouldDelegateFullReplan(action: ReplanningAction): boolean {
  return action === 'FULL_REPLAN';
}
