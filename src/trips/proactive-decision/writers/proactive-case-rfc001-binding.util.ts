/**
 * PD-3 — Map Proactive Case → RFC-001 problem type / semanticCapability.
 */

import type { Rfc001DecisionProblemType } from '../../guardian-decision-core/contracts/decision-problem.types';
import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';

export type ProactiveCaseProblemBinding = {
  type: Rfc001DecisionProblemType;
  semanticCapability: string;
};

export function mapProactiveCaseToRfc001Binding(
  caseId: ProactiveDecisionCaseId,
): ProactiveCaseProblemBinding {
  switch (caseId) {
    case 'CASE_CONTINUE_ACTIVITY':
      return {
        type: 'FEASIBILITY_FAILURE',
        semanticCapability: 'WEATHER_ACTIVITY_PROHIBITED',
      };
    case 'CASE_POSTPONE_ACTIVITY':
      return {
        type: 'SCHEDULE_RISK',
        semanticCapability: 'ACTIVITY_WINDOW_MISSED',
      };
    case 'CASE_REROUTE':
      return {
        type: 'FEASIBILITY_FAILURE',
        semanticCapability: 'ROAD_SEGMENT_UNAVAILABLE',
      };
    default: {
      const _exhaustive: never = caseId;
      return _exhaustive;
    }
  }
}

export function urgencyFromImpactLevel(
  level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL',
): 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL' {
  return level;
}
