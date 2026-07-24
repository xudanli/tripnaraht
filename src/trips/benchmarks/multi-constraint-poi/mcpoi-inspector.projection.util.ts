import type { PlanningInspectorFeasibility } from '../../arrange-itinerary/types/planning-decision-inspector.types';
import type { McpoiPlanEvaluation } from '../../arrange-itinerary/harness/mcpoi-benchmark-evaluator.util';
import { mcpoiPlanStatusHeadline } from './mcpoi-feasibility.projection.util';

export function buildMcpoiInspectorFeasibility(
  evaluations: McpoiPlanEvaluation[],
  input?: { afterProposal?: McpoiPlanEvaluation },
): PlanningInspectorFeasibility {
  const primary = input?.afterProposal ?? pickWorstEvaluation(evaluations);
  const hardCount = primary.hardViolations.length;
  const softCount = primary.softViolations.length;
  const blocked = primary.status === 'INFEASIBLE';
  const caution =
    primary.status === 'FEASIBLE_WITH_TRADEOFF' || primary.status === 'FEASIBLE_WITH_SPLIT';

  const gateChecks: PlanningInspectorFeasibility['gateChecks'] = [
    {
      id: 'gate_mcpoi_wind',
      label: '强风悬崖 (H-07)',
      status: primary.hardViolations.includes('H-07')
        ? 'block'
        : primary.assessments.find((a) => a.constraintId === 'H-07')?.state === 'WARN'
          ? 'warn'
          : 'pass',
    },
    {
      id: 'gate_mcpoi_elder_walk',
      label: '老人步行 (H-03)',
      status: primary.hardViolations.includes('H-03') ? 'block' : 'pass',
    },
    {
      id: 'gate_mcpoi_glacier_checkin',
      label: '冰川签到 (H-05)',
      status: primary.hardViolations.includes('H-05') ? 'block' : 'pass',
    },
    {
      id: 'gate_mcpoi_child_meal',
      label: '儿童午餐 (S-02)',
      status: primary.softViolations.includes('S-02') ? 'warn' : 'pass',
    },
    {
      id: 'gate_mcpoi_member_split',
      label: '成员分流 (S-04)',
      status: primary.metrics.hasSplit ? 'warn' : 'pass',
    },
    {
      id: 'gate_mcpoi_hotel',
      label: '酒店到达 (H-06)',
      status: primary.hardViolations.includes('H-06') ? 'block' : 'pass',
    },
  ];

  const topViolation = primary.assessments.find((a) => a.state === 'VIOLATED');

  return {
    canSafelyWrite: !blocked,
    headline: blocked
      ? '当前方案存在硬约束冲突，暂不建议写入'
      : caution
        ? '当前方案可行，但存在成员权衡'
        : '当前方案可以安全写入行程',
    subheadline: topViolation?.message ?? mcpoiPlanStatusHeadline(primary.status),
    gateChecks,
    validityWarning: {
      message: '测试假数据约束评估（Multi-Constraint POI Benchmark v1）',
      retriggerCondition: 'POI 顺序、分流或世界状态变化时将重新评估',
    },
    executionSummary: [
      {
        id: 'exec_mcpoi_hard',
        label: '硬约束冲突',
        value: `${hardCount} 项`,
        icon: 'users',
      },
      {
        id: 'exec_mcpoi_soft',
        label: '软约束提醒',
        value: `${softCount} 项`,
        icon: 'clock',
      },
    ],
    verdict: {
      status: blocked ? 'blocked' : caution ? 'caution' : 'feasible',
      message: mcpoiPlanStatusHeadline(primary.status),
      detail: topViolation?.message,
    },
  };
}

export function overlayMcpoiInspectorFeasibility(
  base: PlanningInspectorFeasibility,
  evaluations: McpoiPlanEvaluation[],
  afterProposal?: McpoiPlanEvaluation,
): PlanningInspectorFeasibility {
  const mcpoi = buildMcpoiInspectorFeasibility(evaluations, { afterProposal });
  const blocked = mcpoi.verdict.status === 'blocked' || base.verdict.status === 'blocked';
  return {
    ...base,
    canSafelyWrite: base.canSafelyWrite && mcpoi.canSafelyWrite,
    headline: mcpoi.headline,
    subheadline: mcpoi.subheadline ?? base.subheadline,
    gateChecks: [...mcpoi.gateChecks, ...base.gateChecks],
    validityWarning: mcpoi.validityWarning ?? base.validityWarning,
    executionSummary: [...mcpoi.executionSummary, ...base.executionSummary],
    verdict: blocked
      ? { status: 'blocked', message: mcpoi.verdict.message, detail: mcpoi.verdict.detail }
      : mcpoi.verdict.status === 'caution' || base.verdict.status === 'caution'
        ? { status: 'caution', message: mcpoi.verdict.message, detail: mcpoi.verdict.detail }
        : base.verdict,
  };
}

function pickWorstEvaluation(evaluations: McpoiPlanEvaluation[]): McpoiPlanEvaluation {
  const rank = (s: McpoiPlanEvaluation['status']) => {
    if (s === 'INFEASIBLE') return 3;
    if (s === 'FEASIBLE_WITH_TRADEOFF' || s === 'FEASIBLE_WITH_SPLIT') return 2;
    return 1;
  };
  return [...evaluations].sort((a, b) => rank(b.status) - rank(a.status))[0];
}
