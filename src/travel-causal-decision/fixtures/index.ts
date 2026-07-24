import { buildStrongWindAppointmentFixture } from './strong-wind-appointment.fixture';
import { buildRoadClosureOvernightFixture } from './road-closure-overnight.fixture';
import { buildMemberFatigueFixture } from './member-fatigue.fixture';
import { STANDARD_CAUSAL_CASE_IDS, type StandardCausalCaseId } from './case-ids';
import type { TravelCausalDecision } from '../types/travel-causal-decision.types';

export { STANDARD_CAUSAL_CASE_IDS };
export type { StandardCausalCaseId };
export { buildStrongWindAppointmentFixture } from './strong-wind-appointment.fixture';
export { buildRoadClosureOvernightFixture } from './road-closure-overnight.fixture';
export { buildMemberFatigueFixture } from './member-fatigue.fixture';

export function listStandardCausalDecisionFixtures(): Array<{
  caseId: StandardCausalCaseId;
  decision: TravelCausalDecision;
}> {
  return [
    {
      caseId: STANDARD_CAUSAL_CASE_IDS.STRONG_WIND_APPOINTMENT,
      decision: buildStrongWindAppointmentFixture(),
    },
    {
      caseId: STANDARD_CAUSAL_CASE_IDS.ROAD_CLOSURE_OVERNIGHT,
      decision: buildRoadClosureOvernightFixture(),
    },
    {
      caseId: STANDARD_CAUSAL_CASE_IDS.MEMBER_FATIGUE,
      decision: buildMemberFatigueFixture(),
    },
  ];
}
