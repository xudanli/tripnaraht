import type { TripWorldState } from '../../trips/decision/world-model';
import type { DecisionCandidate, PlanningContext } from './contracts/decision-candidate';

export interface PlanningCandidateGenerator {
  generateCandidates(
    worldState: TripWorldState,
    context: PlanningContext,
  ): Promise<DecisionCandidate[]>;
}

export const PLANNING_CANDIDATE_GENERATOR = Symbol('PLANNING_CANDIDATE_GENERATOR');
