/**
 * Guardian 决策权限策略（硬约束不可投票、Abu 存在性否决）
 */
import type { ObjectiveEvaluationResult } from '../objective-function.interface';
import type { NegotiationResult, PersonaEvaluation } from './guardian-persona.interface';

export function countHardViolations(evaluation: ObjectiveEvaluationResult): number {
  return (evaluation.constraints?.hardViolations ?? []).length;
}

/**
 * 硬约束 / Abu BLOCK 不可被多数决推翻。
 * 返回 REJECT 表示必须终止协商；null 表示可进入软约束协商或投票。
 */
export function resolveHardConstraintVeto(
  evaluations: PersonaEvaluation[],
  baseEvaluation: ObjectiveEvaluationResult,
): NegotiationResult['decision'] | null {
  if (countHardViolations(baseEvaluation) > 0) {
    return 'REJECT';
  }

  const abu = evaluations.find((e) => e.persona === 'ABU');
  if (!abu || abu.stance !== 'STRONG_OPPOSE') {
    return null;
  }

  const hardSignal = abu.primaryConcerns.some((c) =>
    /硬约束|不可执行|hardViolations|hard constraint|BLOCK/i.test(c),
  );
  return hardSignal ? 'REJECT' : null;
}

export function buildHardConstraintVetoSummary(
  baseEvaluation: ObjectiveEvaluationResult,
): string {
  const n = countHardViolations(baseEvaluation);
  if (n > 0) {
    return `存在 ${n} 项硬约束违反，方案不可执行；硬约束不可通过投票推翻。`;
  }
  return 'Abu 对硬约束发出 BLOCK，不可通过投票推翻。';
}
