import type { Gate1ProjectStatus } from '../../gate1/constants/gate1.constants';
import { TripStatus } from '../../trips/dto/trip-status.dto';

/**
 * Gate1 experimentStatus → suggested TripStatus (M0 mapping doc §2).
 * Advisory only — does not auto-sync; used for projection and documentation.
 */
export const GATE1_TO_TRIP_STATUS: Record<Gate1ProjectStatus, TripStatus> = {
  DRAFT: TripStatus.DRAFT,
  BASELINE_READY: TripStatus.DRAFT,
  COLLECTING: TripStatus.FORMING,
  ANALYZING: TripStatus.PLANNING,
  ADVISOR_DECIDING: TripStatus.PLANNING,
  READY: TripStatus.PLANNING,
  ACTIVE: TripStatus.TRAVELING,
  COMPLETED: TripStatus.COMPLETED,
  WITHDRAWN: TripStatus.CANCELLED,
};

export function suggestTripStatusForGate1(
  experimentStatus: Gate1ProjectStatus,
): TripStatus {
  return GATE1_TO_TRIP_STATUS[experimentStatus] ?? TripStatus.DRAFT;
}
