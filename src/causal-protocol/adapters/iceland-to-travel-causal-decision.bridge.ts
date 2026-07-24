/**
 * Optional bridge: Iceland causal assessment + schedule → TravelCausalDecision.
 * Keeps causal-protocol free of Nest wiring; callers compose explicitly.
 */

import type { IcelandSelfDriveCausalOutput } from '../../trips/causal-runtime/domains/iceland-self-drive-causal.types';
import {
  projectIcelandToTravelCausalDecision,
  type ProjectIcelandTravelCausalDecisionInput,
  type TravelCausalDecision,
} from '../../travel-causal-decision';

export type BuildTravelCausalDecisionFromIcelandInput = Omit<
  ProjectIcelandTravelCausalDecisionInput,
  'assessment'
> & {
  assessment: IcelandSelfDriveCausalOutput;
};

export function buildTravelCausalDecisionFromIceland(
  input: BuildTravelCausalDecisionFromIcelandInput,
): TravelCausalDecision {
  return projectIcelandToTravelCausalDecision(input);
}
