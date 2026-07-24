/**
 * Travel Party Persona — 多人格解耦（派对聚合）。
 */

import type { ExperienceFlowModel } from './experience-flow.model';
import type { HumanCapabilityModel, PreferredPace, RiskTolerance } from './human-capability.model';

export type PartyMemberRole =
  | 'PRIMARY_TRAVELER'
  | 'COMPANION'
  | 'ELDERLY'
  | 'CHILD'
  | 'GUIDE';

export interface PersonaTimeSlice {
  startLocal: string;
  endLocal: string;
  heterogeneityWeight: number;
  preferredTempo: ExperienceFlowModel['tempo'];
}

export interface TravelPartyPersona {
  memberId: string;
  displayName?: string;
  role: PartyMemberRole;
  capability: Pick<
    HumanCapabilityModel,
    'maxDailyAscentM' | 'rollingAscent3DaysM' | 'maxSlopePct' | 'preferredPace' | 'riskTolerance' | 'maxElevationM'
  > & { preferredPace: PreferredPace; riskTolerance: RiskTolerance };
  experience: Pick<
    ExperienceFlowModel,
    'tempo' | 'heterogeneityIndex' | 'surpriseBuffer' | 'currentFrictionCapacity'
  >;
  timeSlices?: PersonaTimeSlice[];
}

export interface PartyAggregationResult {
  effectiveCapability: HumanCapabilityModel;
  effectiveExperienceFlow: ExperienceFlowModel;
  hardGateTriggeredBy?: string[];
  rhythmMultiplexPlan?: Array<{
    date: string;
    slotHint: string;
    dominantMemberId: string;
    tempo: ExperienceFlowModel['tempo'];
    rationale: string;
  }>;
}
