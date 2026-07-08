/**
 * CP-SAT engine selection — Lab/Shadow only; production Selector stays legacy-frozen.
 */

import type { CpSatSolverEngineId } from './cp-sat-engine.types';

const ENGINE_MAP: Record<string, CpSatSolverEngineId> = {
  LEX_RANK_V0: 'lex-rank-v0',
  'LEX-RANK-V0': 'lex-rank-v0',
  CP_SAT_LEX_V1: 'cp-sat-lex-v1',
  'CP-SAT-LEX-V1': 'cp-sat-lex-v1',
};

/** Default cp-sat-lex-v1 (sequential CP-SAT); fallback lex-rank-v0 via env. */
export function resolveCpSatSolverEngine(): CpSatSolverEngineId {
  const raw = process.env.CP_SAT_SOLVER_ENGINE?.trim().toUpperCase();
  if (raw && ENGINE_MAP[raw]) {
    return ENGINE_MAP[raw];
  }
  if (raw === 'LEX_RANK_V0' || raw === 'LEX-RANK-V0') {
    return 'lex-rank-v0';
  }
  return 'cp-sat-lex-v1';
}

export function isCpSatLabEngineEnabled(): boolean {
  const v = process.env.DECISION_LAB_CP_SAT_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}
