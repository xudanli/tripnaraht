/**
 * TEP Validator input — planning-period snapshot (no Decision Runtime coupling).
 */

import type {
  DailyDrivePlan,
  SelfDriveProfile,
} from '../contracts/tep-self-drive.types';

export interface RoadConditionSnapshot {
  roadRef: string;
  roadId?: string;
  status?: 'OPEN' | 'CLOSED' | 'LIMITED' | 'UNKNOWN';
  observedAt?: string;
  validUntil?: string;
  degraded?: boolean;
}

export interface ActivityArrivalProjection {
  activityRef: string;
  projectedArrivalAt: string;
}

export interface TepValidationInput {
  tripId: string;
  countryCode: string;
  packId?: string;
  packVersion?: string;
  planVersionRef?: string;
  profile: SelfDriveProfile;
  dailyDrivePlans: DailyDrivePlan[];
  roadConditions?: RoadConditionSnapshot[];
  activityArrivals?: ActivityArrivalProjection[];
  evaluatedAt?: string;
}
