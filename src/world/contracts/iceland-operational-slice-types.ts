/**
 * Structured payloads for Iceland operational slices (no ad-hoc JSON strings in the hot path).
 */

import type { SafetravelGetAdvisoriesOutput } from '../../skills/world/safetravel-get-advisories.skill';
import type { IcelandFRoadStatusOutput } from '../../skills/world/iceland-f-road-status.skill';
import type { IcelandDaylightWindowOutput } from '../../skills/world/iceland-world-driving-contracts';
import type { IcelandRentalGuidanceOutput } from '../../skills/world/iceland-rental-guidance.skill';

export type IcelandSafetravelStructured = Pick<
  SafetravelGetAdvisoriesOutput,
  'gate_recommendation' | 'summary' | 'lastUpdated'
> & {
  alertCount: number;
};

export type IcelandFRoadBundleStructured = Pick<IcelandFRoadStatusOutput, 'roads' | 'dataGaps' | 'sources'>;

export type IcelandDaylightStructured = Pick<
  IcelandDaylightWindowOutput,
  | 'daylightHours'
  | 'nightDrivingRisk'
  | 'daylightRegime'
  | 'daylightRisk'
  | 'temporalMileageUnbounded'
  | 'civilTwilightHours'
>;

export type IcelandRentalStructured = Pick<
  IcelandRentalGuidanceOutput,
  'intent_profile' | 'summary_zh' | 'vehicle_policy_hints_zh'
>;
