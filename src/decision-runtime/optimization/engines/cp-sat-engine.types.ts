/**
 * Enumerative lexicographic candidate-selection engine contracts (Lab / Shadow).
 * CP-SAT-compatible semantics — pure TS, not native OR-Tools CP-SAT.
 */

import type { DecisionCandidate } from '../../candidates/contracts/decision-candidate';
import type {
  CanonicalObjectiveId,
  ObjectiveDirection,
} from '../../contracts/objective-definition';

export type CpSatSolverEngineId = 'lex-rank-v0' | 'cp-sat-lex-v1';

export type LexicographicLayer = 'L2' | 'L3' | 'L4';

export interface LexicographicStageTrace {
  stageIndex: number;
  layer: LexicographicLayer;
  objectiveId: string;
  direction: ObjectiveDirection;
  inputCandidateIds: string[];
  objectiveValues: Record<string, number>;
  bestValue: number;
  fixedBound: number;
  eliminatedCandidateIds: string[];
  remainingCandidateIds: string[];
}

/** @deprecated Use LexicographicStageTrace */
export interface CpSatLexStageTrace {
  stageIndex: number;
  objectiveIds: string[];
  fixedBound: number;
  remainingCount: number;
}

export interface CpSatLexObjectiveCell {
  objectiveId: CanonicalObjectiveId;
  layer: LexicographicLayer;
  direction: ObjectiveDirection;
  normalizedValue: number;
}

export interface CpSatLexCandidateEval {
  candidateId: string;
  objectives: CpSatLexObjectiveCell[];
  utilityHint: number;
}

export interface CpSatLexSolveInput {
  candidates: DecisionCandidate[];
  enabledObjectives: CanonicalObjectiveId[];
  timeLimitMs: number;
  candidateEvaluations: CpSatLexCandidateEval[];
}

export interface CpSatLexSolveResult {
  engineId: CpSatSolverEngineId;
  winnerId?: string;
  rankedCandidateIds: string[];
  stageTraces: LexicographicStageTrace[];
  timedOut: boolean;
  elapsedMs: number;
  incumbentFound: boolean;
  tieBreakUsed: boolean;
}
