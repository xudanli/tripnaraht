/**
 * Re-export canonical decision candidate from candidates module.
 * @see ADR-007-Decision-Runtime-v2.md
 */

export type {
  DecisionCandidate,
  DecisionCandidateSource,
  PlanningContext,
} from '../candidates/contracts/decision-candidate';

export const DECISION_CANDIDATE_SCHEMA_ID = 'tripnara.decision_candidate@v1';
