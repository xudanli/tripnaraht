/**
 * P15-A — Multi-Agent Execution OS: competing execution perspectives over one DAG/IR witness.
 */

import type { ExecutionTruthDAG } from '../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionProgram } from '../execution-program/execution-program.types';

export type ExecutionAgentStrategy =
  | 'SAFETY_FIRST'
  | 'UTILITY_MAX'
  | 'COST_MIN'
  | 'EXPERIENCE_MAX'
  | 'WEATHER_CHASER';

export interface ExecutionAgent {
  id: string;
  strategy: ExecutionAgentStrategy;
  /** Participation weight in consensus scalar (not learned at runtime). */
  weight: number;
  evaluate(dag: ExecutionTruthDAG, ir: ExecutionIR): ExecutionCandidate;
}

export interface ExecutionCandidateScores {
  utility: number;
  risk: number;
  cost: number;
  stability: number;
}

export interface ExecutionCandidate {
  agentId: string;
  dagId: string;
  strategy: ExecutionAgentStrategy;
  score: ExecutionCandidateScores;
  proposal: ExecutionProgram;
}

export interface MultiAgentExecutionResult {
  candidates: ExecutionCandidate[];
  consensus: ExecutionCandidate;
}
