import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type {
  McpoiConstraintAssessment,
  McpoiPlanEvaluation,
} from '../../arrange-itinerary/harness/mcpoi-benchmark-evaluator.util';

function issuePriority(assessment: McpoiConstraintAssessment): FeasibilityIssueDto['priority'] {
  if (assessment.severity === 'HARD') return 'must_handle';
  return 'suggest_adjust';
}

function issueSeverity(assessment: McpoiConstraintAssessment): FeasibilityIssueDto['severity'] {
  if (assessment.severity === 'HARD') return 'high';
  if (assessment.state === 'WARN') return 'medium';
  return 'medium';
}

function buildRepairHint(assessment: McpoiConstraintAssessment): string | undefined {
  switch (assessment.constraintId) {
    case 'H-07':
      return '将 Dyrhólaey 调整到强风窗口之前，或替换为室内恢复点';
    case 'H-03':
      return '减少老人步行负荷：删 POI、缩短停留或分流低体力成员';
    case 'H-05':
      return '确保 09:30 前到达冰川签到点；避免在前序插入耗时 POI';
    case 'H-04':
      return '儿童不可参加冰川徒步；考虑成员分流';
    case 'S-02':
      return '在 12:00—13:30 安排儿童午餐';
    case 'S-04':
      return '评估是否接受成员分流以同时满足核心体验与体力约束';
    default:
      return undefined;
  }
}

export function projectMcpoiAssessmentToFeasibilityIssue(
  tripId: string,
  evaluation: McpoiPlanEvaluation,
  assessment: McpoiConstraintAssessment,
): FeasibilityIssueDto {
  const dayNumber = evaluation.dayIndex + 1;
  const isHard = assessment.severity === 'HARD' && assessment.state === 'VIOLATED';
  return {
    id: `mcpoi-${tripId}-d${dayNumber}-${assessment.constraintId}`,
    semanticKey: `mcpoi:${assessment.constraintId}:day${dayNumber}`,
    priority: issuePriority(assessment),
    category: isHard ? 'safety' : 'member',
    title: `${assessment.constraintId} ${assessment.severity === 'HARD' ? '硬约束' : '软约束'}`,
    message: assessment.message,
    affectedDays: [dayNumber],
    affectedDayNumbers: [dayNumber],
    severity: issueSeverity(assessment),
    issueKind: isHard ? 'member_hard_constraint' : 'member_soft_constraint',
    resolutionMode: isHard ? 'DECISION_REQUIRED' : undefined,
    escalationReason: isHard
      ? 'Multi-Constraint POI Benchmark 硬约束阻断'
      : undefined,
    actionRequired: buildRepairHint(assessment),
    proofs: [
      {
        entity: assessment.constraintId,
        constraint: assessment.constraintId,
        currentFact: assessment.state,
        evidenceSource: 'mcpoi_benchmark',
        evidenceType: 'deterministic_evaluator',
        conclusion: assessment.message,
      },
    ],
    uiHints: {
      affectedMemberIds: assessment.affectedMembers,
      planStatus: evaluation.status,
      benchmark: true,
    },
  };
}

export function projectMcpoiEvaluationsToFeasibilityIssues(
  tripId: string,
  evaluations: McpoiPlanEvaluation[],
): FeasibilityIssueDto[] {
  const issues: FeasibilityIssueDto[] = [];
  for (const evaluation of evaluations) {
    for (const assessment of evaluation.assessments) {
      if (assessment.state === 'SATISFIED') continue;
      issues.push(projectMcpoiAssessmentToFeasibilityIssue(tripId, evaluation, assessment));
    }
  }
  return issues;
}

export function mcpoiPlanStatusHeadline(status: McpoiPlanEvaluation['status']): string {
  switch (status) {
    case 'INFEASIBLE':
      return '不可执行（硬约束冲突）';
    case 'FEASIBLE_WITH_SPLIT':
      return '可行（建议成员分流）';
    case 'FEASIBLE_WITH_TRADEOFF':
      return '可行（存在权衡）';
    default:
      return '可执行';
  }
}
