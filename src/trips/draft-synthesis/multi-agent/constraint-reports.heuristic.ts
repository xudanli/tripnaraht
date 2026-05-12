import type { ObjectiveVector } from '../pareto/objective-vector.types';
import type { PlanConstraintReport } from './constraint-report.types';

/**
 * 用已有 ObjectiveVector 做轻量 Constraint Agent 报告（无三位仿真时的务实近似）。
 * blocking：极端风险/疲劳不可接受；soft：体验-路线张力等。
 */
export function buildHeuristicConstraintReports(
  plans: Array<{ planId: string; objectives: ObjectiveVector }>,
): PlanConstraintReport[] {
  return plans.map(({ planId, objectives: o }) => {
    const violations: PlanConstraintReport['violations'] = [];

    if (o.risk < 0.18) {
      violations.push({
        kind: 'RISK',
        severity: 'blocking',
        detail: `risk 信号过低 (${o.risk.toFixed(2)})，视为不可执行风险过高`,
      });
    } else if (o.risk < 0.28) {
      violations.push({
        kind: 'RISK',
        severity: 'soft',
        detail: '风险边际偏低，建议保守复核',
      });
    }

    if (o.fatigue < 0.22) {
      violations.push({
        kind: 'TIME',
        severity: 'blocking',
        detail: `疲劳舒缓度过低 (${o.fatigue.toFixed(2)})`,
      });
    }

    if (o.experience > 0.72 && o.efficiency < 0.38) {
      violations.push({
        kind: 'EXPERIENCE_ROUTE',
        severity: 'soft',
        detail: '体验丰富但与路线效率张力大（好玩但远）',
      });
    }

    if (o.cost < 0.25) {
      violations.push({ kind: 'COST', severity: 'soft', detail: '成本友好度偏低' });
    }

    const blocking = violations.some((v) => v.severity === 'blocking');

    return {
      planId,
      violations,
      isOperationallyFeasible: !blocking,
    };
  });
}
