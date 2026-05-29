/**
 * Persona closure loop — Neptune REPLACE 后 Abu 有界重验。
 * @see StrategyOrchestratorService / PersonaClosureLoopService
 */

export interface PersonaClosureBudget {
  /** post-Neptune Abu 重验上限（默认 2，与 candidateSearch repairMaxIters 对齐） */
  maxIters: number;
  /** Abu 重验失败后 Neptune 收缩重试次数（每 iter） */
  maxNeptuneRetriesPerIter: number;
  /** P0.2：Abu 重验通过后是否轻量重跑 Dr.Dre */
  revalidateDrdreAfterAbuPass: boolean;
}

export type PersonaClosureStopReason =
  | 'NO_REPLACE'
  | 'ABU_RECHECK_PASS'
  | 'ITER_LIMIT'
  | 'NEPTUNE_SHRINK_EXHAUSTED'
  | 'ABU_FATAL_REJECT';

export interface PersonaClosureIterAudit {
  iter: number;
  neptuneAction: 'REPLACE' | 'ALLOW';
  planFingerprintBefore: string;
  planFingerprintAfter: string;
  abuRecheck: 'ALLOW' | 'REJECT' | 'SKIPPED';
  newHardViolations: string[];
  stopReason: PersonaClosureStopReason;
}

export interface PersonaClosureAudit {
  iters: PersonaClosureIterAudit[];
  stopReason: PersonaClosureStopReason;
  totalAbuRechecks: number;
}

export interface NeptuneEvaluateOptions {
  /** 收缩模式：至多一次 REPLACE，且跳过 rejectedFingerprints 中的补丁 */
  shrinkMode?: boolean;
  rejectedFingerprints?: string[];
}

export const DEFAULT_PERSONA_CLOSURE_BUDGET: PersonaClosureBudget = {
  maxIters: 2,
  maxNeptuneRetriesPerIter: 1,
  revalidateDrdreAfterAbuPass: false,
};

/** Env: TRIP_PERSONA_CLOSURE_LOOP=1 */
export function isPersonaClosureLoopEnabled(): boolean {
  return process.env.TRIP_PERSONA_CLOSURE_LOOP === '1';
}
