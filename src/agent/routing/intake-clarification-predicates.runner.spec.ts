import {
  shouldReturnClarificationForHardGaps,
  shouldReturnClarificationForMarathonIntake,
} from './intake-clarification-predicates.runner';
import type { OrchestratorState } from '../interfaces/trip-plan.interface';

describe('intake-clarification-predicates.runner', () => {
  it('detects marathon intake short circuit', () => {
    const state = {
      metadata: { marathon_intake_clarification_short_circuit: true },
      clarification_questions: [{}],
    } as unknown as OrchestratorState;
    expect(shouldReturnClarificationForMarathonIntake(state)).toBe(true);
  });

  it('blocks on HARD gaps with clarification', () => {
    const state = {
      metadata: {},
      gaps: [{ severity: 'HARD', type: 'X' }],
      clarification_questions: [{}],
    } as unknown as OrchestratorState;
    expect(shouldReturnClarificationForHardGaps(state)).toBe(true);
  });
});
