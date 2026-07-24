/**
 * Solver capability nomenclature SSOT.
 *
 * cp-sat-lex-v1 is a CP-SAT-*compatible* lexicographic selector over pre-built
 * full-plan candidates — NOT POI-level native CP-SAT combinatorial planning.
 *
 * Public name: CP-SAT-compatible Lexicographic Candidate Selector
 * Do NOT describe as "real CP-SAT travel planner" in RFC/docs until native binding ships.
 */

import type { OptimizationLevel, SolverFamily } from '../contracts/optimization-result';

export const CP_SAT_COMPATIBLE_LEX_DISPLAY_NAME =
  'CP-SAT-compatible Lexicographic Candidate Selector';

export const CP_SAT_LEX_CANDIDATE_SELECTOR_CAPABILITY = {
  strategyId: 'cp-sat-lexicographic' as const,
  displayName: CP_SAT_COMPATIBLE_LEX_DISPLAY_NAME,
  solverFamily: 'ENUMERATIVE_LEXICOGRAPHIC_SELECTION' as SolverFamily,
  optimizationLevel: 'FULL_PLAN_CANDIDATE_SELECTION' as OptimizationLevel,
  nativeCpSat: false,
};

export const LEGACY_FROZEN_SELECTOR_CAPABILITY = {
  strategyId: 'legacy-frozen' as const,
  displayName: 'Legacy DecisionCore Finalize Selector',
  solverFamily: 'DECISION_CORE_FINALIZE' as SolverFamily,
  optimizationLevel: 'FULL_PLAN_CANDIDATE_SELECTION' as OptimizationLevel,
  nativeCpSat: false,
};

export const LEX_RANK_V0_CAPABILITY = {
  solverEngine: 'lex-rank-v0' as const,
  displayName: 'Lexicographic Rank Fallback (v0)',
  solverFamily: 'LEXICOGRAPHIC_RANK_FALLBACK' as SolverFamily,
  optimizationLevel: 'FULL_PLAN_CANDIDATE_SELECTION' as OptimizationLevel,
  nativeCpSat: false,
};
