/**
 * P3-3：Commit 协议闸门 — 仅判定是否允许 apply，不执行 mutate。
 */

import type { RewriteSimulation } from './rewrite-simulation.types';

export interface RewriteCommitContext {
  migrationEconomicsApproved?: boolean;
  restructuringPressureApproved?: boolean;
  /** 引入的约束 violation 中含 HARD 级语义则禁止 commit */
  hasIntroducedHardViolation?: boolean;
}

export interface RewriteCommitReadiness {
  allowed: boolean;
  reasons: string[];
}

/**
 * 与「双钥匙」对齐：经济学 + 重构压力 + simulation 未退化 + 无新 HARD。
 */
export function evaluateRewriteCommitReadiness(
  simulation: RewriteSimulation,
  ctx: RewriteCommitContext,
): RewriteCommitReadiness {
  const reasons: string[] = [];

  if (simulation.verdict !== 'IMPROVED') {
    reasons.push(`verdict=${simulation.verdict}（需 IMPROVED）`);
  }

  if (ctx.migrationEconomicsApproved !== true) {
    reasons.push('migrationEconomicsApproved 未通过');
  }

  if (ctx.restructuringPressureApproved !== true) {
    reasons.push('restructuringPressureApproved 未通过');
  }

  if (ctx.hasIntroducedHardViolation) {
    reasons.push('引入 HARD 级约束违规');
  }

  const hardIntroduced = simulation.projectedConstraintChanges.introducedViolations.some(v =>
    /HARD|BLOCKED/i.test(v),
  );
  if (hardIntroduced) {
    reasons.push('projectedConstraintChanges 含 HARD/BLOCKED 语义');
  }

  return {
    allowed: reasons.length === 0,
    reasons,
  };
}
