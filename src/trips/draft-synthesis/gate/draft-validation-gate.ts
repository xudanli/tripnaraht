import type { ConvergenceResult } from '../convergence/convergence.types';
import type {
  DraftGateRepairAction,
  DraftGateScores,
  DraftGateStatus,
  DraftGateBlockingIssue,
  DraftValidationGateInput,
  DraftValidationGateResult,
} from './draft-validation-gate.types';

const DEFAULT_MIN_APPROVE = 0.55;
const DEFAULT_HARD_REJECT = 0.15;
const DEFAULT_MAX_DIVERGENCE = 8;

function buildScores(agreement: number, convergence: ConvergenceResult): DraftGateScores {
  const divPenalty = Math.min(1, convergence.divergenceAreas.length / 10);
  return {
    feasibility: Number((agreement * (1 - divPenalty * 0.5)).toFixed(3)),
    continuity: Number(convergence.agreementScore.toFixed(3)),
    constraintSatisfaction: Number((0.5 + 0.5 * agreement).toFixed(3)),
  };
}

/**
 * Draft → Executable 过渡门控：判断草案是否可进入执行系统（非「好不好」，而是「能不能」）。
 * 规则：结构约束与双引擎对齐优先；不允许仅凭 LLM 单独 APPROVE。
 */
export function runDraftValidationGate(input: DraftValidationGateInput): DraftValidationGateResult {
  const { convergence, llmEngineRan, algoEngineRan, options = {} } = input;
  const minAgreement = options.minAgreementToApprove ?? DEFAULT_MIN_APPROVE;
  const hardReject = options.hardRejectBelowAgreement ?? DEFAULT_HARD_REJECT;
  const maxDiv = options.maxDivergenceSlots ?? DEFAULT_MAX_DIVERGENCE;
  const arbitrationMerge = options.acceptSlotArbitrationMerge === true;

  const blockingIssues: DraftGateBlockingIssue[] = [];
  const repairActions: DraftGateRepairAction[] = [];

  const agreement = convergence.agreementScore;
  const divCount = convergence.divergenceAreas.length;

  if (!llmEngineRan || !algoEngineRan) {
    blockingIssues.push({
      type: 'dual_engine_required',
      day: 0,
      slot: '*',
      detail: '需要 LLM 与算法双路径均参与方可进入可执行门控',
    });
    repairActions.push({
      action: 'rerun_missing_engine',
      target: !llmEngineRan ? 'LLM' : 'ALGO',
    });
    return {
      status: 'NEEDS_REPAIR',
      score: buildScores(agreement, convergence),
      blockingIssues,
      repairActions,
    };
  }

  if (agreement < hardReject) {
    blockingIssues.push({
      type: 'low_agreement',
      day: 0,
      slot: '*',
      detail: `双引擎一致度过低 (${agreement})`,
    });
    repairActions.push({ action: 'rerun_convergence_or_override', target: 'policy' });
    return {
      status: 'REJECTED',
      score: buildScores(agreement, convergence),
      blockingIssues,
      repairActions,
    };
  }

  /** Slot 仲裁后的融合路径：不因原始分歧阻断，只要一致度与分歧数量在护栏内即 APPROVED */
  if (arbitrationMerge) {
    if (divCount > maxDiv) {
      blockingIssues.push({
        type: 'high_divergence',
        day: 0,
        slot: '*',
        detail: `分歧槽位过多 (${divCount} > ${maxDiv})`,
      });
      repairActions.push({ action: 'apply_override_plan', target: 'SlotArbitration.finalSelections' });
      return {
        status: 'NEEDS_REPAIR',
        score: buildScores(agreement, convergence),
        blockingIssues,
        repairActions,
      };
    }
    if (agreement < minAgreement) {
      blockingIssues.push({
        type: 'below_min_agreement',
        day: 0,
        slot: '*',
        detail: `一致度 ${agreement} < ${minAgreement}`,
      });
      repairActions.push({ action: 'tune_policy_or_rerun', target: 'engines' });
      return {
        status: 'NEEDS_REPAIR',
        score: buildScores(agreement, convergence),
        blockingIssues,
        repairActions,
      };
    }
    return {
      status: 'APPROVED',
      score: buildScores(agreement, convergence),
      blockingIssues: [],
      repairActions: [],
    };
  }

  if (divCount > maxDiv) {
    blockingIssues.push({
      type: 'high_divergence',
      day: 0,
      slot: '*',
      detail: `分歧槽位过多 (${divCount} > ${maxDiv})`,
    });
    repairActions.push({ action: 'apply_override_plan', target: 'ConvergenceResult.overridePlan' });
    return {
      status: 'NEEDS_REPAIR',
      score: buildScores(agreement, convergence),
      blockingIssues,
      repairActions,
    };
  }

  for (const d of convergence.divergenceAreas) {
    if (d.type === 'meal') {
      blockingIssues.push({
        type: 'meal_divergence',
        day: d.day,
        slot: d.slot,
        detail: d.reason,
      });
      repairActions.push({
        action: 'replace_place',
        day: d.day,
        slot: d.slot,
        placeId: convergence.overridePlan.find((s) => s.day === d.day && s.slot === d.slot)?.placeId,
      });
    }
  }

  /** 仍有分歧但未超限：必须走修复/融合，不允许直接进入执行态 */
  if (divCount > 0) {
    return {
      status: 'NEEDS_REPAIR',
      score: buildScores(agreement, convergence),
      blockingIssues:
        blockingIssues.length > 0
          ? blockingIssues
          : [
              {
                type: 'divergence_pending',
                day: 0,
                slot: '*',
                detail: `存在 ${divCount} 处槽位分歧，需应用 override 或重跑`,
              },
            ],
      repairActions:
        repairActions.length > 0
          ? repairActions
          : [{ action: 'apply_override_plan', target: 'ConvergenceResult.overridePlan' }],
    };
  }

  if (agreement < minAgreement) {
    blockingIssues.push({
      type: 'below_min_agreement',
      day: 0,
      slot: '*',
      detail: `一致度 ${agreement} < ${minAgreement}`,
    });
    repairActions.push({ action: 'tune_policy_or_rerun', target: 'convergence' });
    return {
      status: 'NEEDS_REPAIR',
      score: buildScores(agreement, convergence),
      blockingIssues,
      repairActions,
    };
  }

  const status: DraftGateStatus = 'APPROVED';
  return {
    status,
    score: buildScores(agreement, convergence),
    blockingIssues: [],
    repairActions: [],
  };
}
