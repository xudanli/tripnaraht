/**
 * P1 — 规划期 DecisionProblem 投影（reason + impact + options）
 * @see internal-docs/frontend/TEP-SELF-DRIVE-WEB-P1-INTEGRATION.md
 */

import type {
  ExecutabilityAssessment,
  PlanningRuleResult,
  RecoveryGraph,
  RecoveryOption,
} from '../contracts/tep-self-drive.types';
import type { LocalRepairPreview } from './recovery-graph.projector';

export interface PlanningTepDecisionProblemImpact {
  summary: string;
  loadTierBefore?: LocalRepairPreview['loadTierBefore'];
  loadTierAfter?: LocalRepairPreview['loadTierAfter'];
  statusBefore: ExecutabilityAssessment['status'];
  statusAfter: ExecutabilityAssessment['status'];
  affectedRefs: string[];
  minutesReleased?: number;
}

export interface PlanningTepDecisionProblemOption {
  optionId: string;
  action: RecoveryOption['action'];
  label: string;
  description: string;
  targetRefs: string[];
  recommended: boolean;
  replacementPoiId?: string;
}

export interface PlanningTepDecisionProblem {
  problemId: string;
  phase: 'PLANNING';
  triggerRuleIds: string[];
  reason: string;
  impact: PlanningTepDecisionProblemImpact;
  options: PlanningTepDecisionProblemOption[];
  recommendedOptionId?: string;
}

const REPAIR_RULE_OUTCOMES = new Set<PlanningRuleResult['outcome']>([
  'SUGGEST_REPAIR',
  'REJECT',
  'NEED_CONFIRM',
]);

function actionLabel(action: RecoveryOption['action']): string {
  switch (action) {
    case 'REMOVE':
      return '删除节点';
    case 'REPLACE':
      return '替换活动';
    case 'SHIFT':
      return '调整时间';
    case 'REROUTE':
      return '改道';
    default:
      return action;
  }
}

function statusRank(status: ExecutabilityAssessment['status']): number {
  switch (status) {
    case 'EXECUTABLE':
      return 0;
    case 'EXECUTABLE_WITH_CAUTION':
      return 1;
    case 'REQUIRES_CONFIRMATION':
      return 2;
    case 'REQUIRES_REPAIR':
      return 3;
    case 'NOT_EXECUTABLE':
      return 4;
    default:
      return 5;
  }
}

function pickBestPreview(previews: LocalRepairPreview[]): LocalRepairPreview | undefined {
  if (previews.length === 0) return undefined;
  return [...previews].sort((a, b) => statusRank(a.statusAfter) - statusRank(b.statusAfter))[0];
}

function resolveDayRef(ruleResult: PlanningRuleResult): string {
  return (
    ruleResult.affectedRefs.find((r) => r.startsWith('day_')) ??
    ruleResult.affectedRefs[0] ??
    'day_unknown'
  );
}

/** 将规划期 ruleResults + repairPreviews + RecoveryGraph 投影为 DecisionProblem 读模型 */
export function projectPlanningTepDecisionProblems(input: {
  tripId: string;
  assessmentStatus: ExecutabilityAssessment['status'];
  ruleResults: PlanningRuleResult[];
  recoveryGraph: RecoveryGraph;
  repairPreviews: LocalRepairPreview[];
}): PlanningTepDecisionProblem[] {
  if (input.repairPreviews.length === 0) return [];

  const triggerRuleIds = [
    ...new Set(
      input.recoveryGraph.fallbackOptions
        .map((o) => o.triggerRuleId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const problems: PlanningTepDecisionProblem[] = [];

  for (const ruleId of triggerRuleIds) {
    const options = input.recoveryGraph.fallbackOptions.filter((o) => o.triggerRuleId === ruleId);
    if (options.length === 0) continue;

    const previews = input.repairPreviews.filter((p) =>
      options.some((o) => o.optionId === p.optionId),
    );
    const bestPreview = pickBestPreview(previews);

    const ruleResult = input.ruleResults.find(
      (r) => r.ruleId === ruleId && REPAIR_RULE_OUTCOMES.has(r.outcome),
    );
    const dayRef = ruleResult ? resolveDayRef(ruleResult) : 'day_unknown';
    const reason =
      ruleResult?.explanation ??
      bestPreview?.description ??
      `规划期规则 ${ruleId} 建议调整以恢复可执行性`;

    problems.push({
      problemId: `tep_planning:${input.tripId}:${ruleId}:${dayRef}`,
      phase: 'PLANNING',
      triggerRuleIds: [ruleId],
      reason,
      impact: {
        summary: bestPreview?.description ?? reason,
        loadTierBefore: bestPreview?.loadTierBefore,
        loadTierAfter: bestPreview?.loadTierAfter,
        statusBefore: bestPreview?.statusBefore ?? input.assessmentStatus,
        statusAfter: bestPreview?.statusAfter ?? input.assessmentStatus,
        affectedRefs: ruleResult?.affectedRefs ?? bestPreview?.targetRefs ?? [],
        minutesReleased: bestPreview?.minutesReleased,
      },
      options: options.map((opt) => ({
        optionId: opt.optionId,
        action: opt.action,
        label: actionLabel(opt.action),
        description: opt.description,
        targetRefs: opt.targetRefs,
        recommended: opt.optionId === bestPreview?.optionId,
        replacementPoiId: opt.replacementPoiId,
      })),
      recommendedOptionId: bestPreview?.optionId,
    });
  }

  return problems;
}
