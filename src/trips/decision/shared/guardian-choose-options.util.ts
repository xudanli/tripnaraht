import type { StrategyOrchestrationResultV2 } from '../optimization/strategy-orchestrator-v2.service';

/** 与 negotiation humanDecisionPoints / optimize userJudgmentPoints 对齐的 CHOOSE 选项结构 */
export interface GuardianChooseOptionPoint {
  id?: string;
  question: string;
  options?: string[];
  recommendation?: string;
}

/** 扁平化为 GuardianChooseModal 可读的 string[]（与 team humanDecisionPointsFlat 同规则） */
export function flattenChooseOptionPoints(
  points: GuardianChooseOptionPoint[] | undefined,
): string[] {
  if (!points?.length) return [];
  const flat: string[] = [];
  for (const point of points) {
    const opts = (point.options ?? []).map((o) => String(o).trim()).filter(Boolean);
    if (opts.length > 0) {
      flat.push(...opts);
    } else if (point.question?.trim()) {
      flat.push(point.question.trim());
    }
  }
  return [...new Set(flat)].slice(0, 12);
}

/** 为一键优化结果附加 CHOOSE 读路径字段 */
export function enrichOptimizeResultChooseFields(
  result: StrategyOrchestrationResultV2,
): StrategyOrchestrationResultV2 {
  const hardConstraintBlocked = result.finalAction === 'REJECT' || result.allowed === false;
  const humanDecisionPointsFlat = hardConstraintBlocked
    ? undefined
    : flattenChooseOptionPoints(result.userJudgmentPoints);
  const chooseRequired = Boolean(humanDecisionPointsFlat?.length);
  return {
    ...result,
    hardConstraintBlocked: hardConstraintBlocked || undefined,
    humanDecisionPointsFlat,
    chooseRequired: chooseRequired || undefined,
  };
}
