import { personaUtilityScore } from '../pareto/pareto-selection.engine';
import type { ObjectiveVector } from '../pareto/objective-vector.types';
import type { PlanConstraintReport } from './constraint-report.types';
import type {
  ConflictResolutionLogEntry,
  MultiAgentNegotiationInput,
  MultiAgentNegotiationResult,
} from './negotiation.types';
import { defaultAgentContributions } from './agent-contributions';

function reportByPlanId(reports: PlanConstraintReport[]): Map<string, PlanConstraintReport> {
  return new Map(reports.map((r) => [r.planId, r]));
}

/**
 * Constraint dominance：先剔除 operational blocking；再在可行集上最大化人格效用。
 * 若可行集为空：回退到「风险最高」的候选（保守可行）。
 */
export function runMultiAgentNegotiation(input: MultiAgentNegotiationInput): MultiAgentNegotiationResult {
  const { paretoPlans, personaType, reports, contributions, draftGateStatus } = input;
  const rmap = reportByPlanId(reports);
  const log: ConflictResolutionLogEntry[] = [];

  const scored = paretoPlans.map((p) => ({
    ...p,
    utility: personaUtilityScore(p.objectives, personaType),
    report: rmap.get(p.planId),
  }));

  for (const p of scored) {
    const rep = p.report;
    if (!rep) {
      log.push({
        planId: p.planId,
        action: 'FILTERED_BY_CONSTRAINT',
        detail: '缺少 Constraint 报告，跳过',
      });
      continue;
    }
    if (!rep.isOperationallyFeasible) {
      log.push({
        planId: p.planId,
        action: 'FILTERED_BY_CONSTRAINT',
        detail: rep.violations
          .filter((v) => v.severity === 'blocking')
          .map((v) => v.detail)
          .join('; '),
      });
    }
  }

  let feasible = scored.filter((s) => s.report?.isOperationallyFeasible);

  if (draftGateStatus === 'REJECTED' && feasible.length > 1) {
    feasible = feasible.filter((s) => s.planId === 'MERGED');
    if (feasible.length === 0) feasible = scored.filter((s) => s.report?.isOperationallyFeasible);
  }

  const pickBestUtility = (pool: typeof scored) => {
    let best = pool[0];
    for (let i = 1; i < pool.length; i++) {
      if (pool[i].utility > best.utility) best = pool[i];
    }
    return best;
  };

  let selected: (typeof scored)[0];

  if (feasible.length > 0) {
    selected = pickBestUtility(feasible);
    for (const f of feasible) {
      if (f.planId !== selected.planId) {
        log.push({
          planId: f.planId,
          action: 'ACCEPTED',
          detail: `可行但未选：效用 ${f.utility.toFixed(4)} < ${selected.utility.toFixed(4)}`,
        });
      }
    }
    log.push({
      planId: selected.planId,
      action: 'SELECTED_UTILITY',
      detail: `可行集上人格效用最大 (${selected.utility.toFixed(4)})`,
    });
  } else if (scored.length > 0) {
    const byRisk = [...scored].sort(
      (a, b) => b.objectives.risk - a.objectives.risk,
    );
    selected = byRisk[0];
    log.push({
      planId: selected.planId,
      action: 'SELECTED_UTILITY',
      detail: '无可行集：回退至风险目标最高（保守）',
    });
  } else {
    throw new Error('runMultiAgentNegotiation: empty paretoPlans');
  }

  const planIds = paretoPlans.map((p) => p.planId);
  const contrib = contributions ?? defaultAgentContributions(planIds);

  return {
    selectedPlanId: selected.planId,
    conflictResolutionLog: log,
    contributions: contrib,
  };
}

/** 便捷：从 objectives 列表生成输入所需 paretoPlans */
export function toParetoPlans(
  items: Array<{ planId: string; objectives: ObjectiveVector }>,
): MultiAgentNegotiationInput['paretoPlans'] {
  return items.map(({ planId, objectives }) => ({ planId, objectives }));
}
