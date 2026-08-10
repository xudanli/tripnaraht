/**
 * Port: Look DecisionProblem persistence (Preview-only; no Apply).
 */

import type {
  LookDecisionProblem,
  LookDecisionProblemUpsertInput,
} from './look-decision-problem.types';
import type { Rfc001DecisionProblem } from '../../guardian-decision-core/contracts/decision-problem.types';

export const LOOK_RFC001_WRITER = Symbol('LOOK_RFC001_WRITER');

/**
 * Minimal RFC-001 writer surface used by Look projection.
 * Production: Rfc001DecisionProblemStoreService
 * Tests: InMemoryRfc001DecisionProblemWriter
 */
export interface LookRfc001Writer {
  findOpenByTriggerEvent(
    tripId: string,
    triggerEventId: string,
  ): Promise<Rfc001DecisionProblem | undefined>;
  upsert(
    tripId: string,
    problem: Rfc001DecisionProblem,
  ): Promise<Rfc001DecisionProblem>;
}

export interface LookDecisionProblemPort {
  upsert(input: LookDecisionProblemUpsertInput): LookDecisionProblem;
  get(problemId: string): LookDecisionProblem | undefined;
  getByObservation(observationId: string): LookDecisionProblem | undefined;
}
