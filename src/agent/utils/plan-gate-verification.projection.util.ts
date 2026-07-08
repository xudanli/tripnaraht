import type { PersonaShellOutput } from '../services/persona-shell.service';
import type { PlanningWorkbenchResponse } from '../services/planning-workbench-agent.service';
import type { PlanState } from '../../skills/plan/shared/plan-state.types';
import type { GuardianPersonaPresentation } from '../../trips/decision/shared/guardian-presentation.types';
import type {
  PlanGateConfirmedItemDto,
  PlanGateDimensionKey,
  PlanGateDimensionStatus,
  PlanGateOverallStatus,
  PlanGatePendingConfirmationDto,
  PlanGatePipelineStepDto,
  PlanGatePipelineStepId,
  PlanGateSubmitEligibilityDto,
  PlanGateSubmitMode,
  PlanGateUiDto,
  PlanGateVerificationCheckItemDto,
  PlanGateVerificationDimensionDto,
} from '../dto/plan-gate.dto';
import {
  buildUserSignOffConfirmations,
  buildRiskFactSummary,
  splitDecisionLayers,
  type DecisionLayers,
} from './planning-workbench-execute-enrich.util';
import type { WorkbenchConsolidatedDecisionStatus } from '../services/planning-workbench-agent.service';
import { resolveHardConstraintBlocked } from '../../trips/decision/shared/guardian-presentation.util';

const DIMENSION_TITLES: Record<PlanGateDimensionKey, string> = {
  safetyFeasibility: '安全与可行性',
  paceLoad: '节奏与负荷',
  experienceCompleteness: '体验与完整性',
};

const PIPELINE_LABELS: Record<PlanGatePipelineStepId, string> = {
  merge_decisions: '合并决策结果',
  restructure_itinerary: '重排行程结构',
  compute_routes_timing: '计算路线与时间',
  check_budget_members: '检查预算与成员',
  pre_submit_verification: '执行提交前验证',
};

function worstStatus(
  statuses: PlanGateDimensionStatus[],
): PlanGateDimensionStatus {
  const rank: Record<PlanGateDimensionStatus, number> = {
    blocked: 5,
    insufficient_data: 4,
    need_confirm: 3,
    suggest_adjust: 2,
    pass: 1,
  };
  return statuses.reduce(
    (worst, s) => (rank[s] > rank[worst] ? s : worst),
    'pass' as PlanGateDimensionStatus,
  );
}

function mapGateToDimensionStatus(
  gateFragment: 'ALLOW' | 'REJECT' | 'ADJUST' | 'REPLACE' | 'NEED_CONFIRM' | undefined,
  blocked: boolean,
): PlanGateDimensionStatus {
  if (blocked) return 'blocked';
  switch (gateFragment) {
    case 'REJECT':
      return 'blocked';
    case 'ADJUST':
    case 'REPLACE':
      return 'suggest_adjust';
    case 'NEED_CONFIRM':
      return 'need_confirm';
    default:
      return 'pass';
  }
}

function buildSafetyDimension(planState: PlanState): PlanGateVerificationDimensionDto {
  const checks: PlanGateVerificationCheckItemDto[] = [];
  const gate = planState.gate ?? { status: 'NEED_CONFIRM' as const, reasons: [], missingEvidence: [] };
  const infeasible = planState.mobility.transferSegments.filter(
    (s) => s.feasibility === 'infeasible',
  ).length;

  for (const reason of gate.reasons ?? []) {
    checks.push({
      id: `gate_reason_${checks.length}`,
      label: String(reason),
      status: gate.status === 'REJECT' ? 'blocked' : 'need_confirm',
    });
  }

  for (const missing of gate.missingEvidence ?? []) {
    checks.push({
      id: `missing_evidence_${checks.length}`,
      label: String(missing),
      status: 'insufficient_data',
    });
  }

  if (infeasible > 0) {
    checks.push({
      id: 'transfer_infeasible',
      label: `${infeasible} 段交通不可达`,
      status: 'blocked',
    });
  }

  const abu = gate.guardianResults?.abu;
  if (abu?.evidence?.length) {
    for (const ev of abu.evidence) {
      checks.push({
        id: `abu_evidence_${checks.length}`,
        label: String(ev),
        status: abu.verdict === 'REJECT' ? 'blocked' : 'need_confirm',
      });
    }
  }

  const feasibilityConflicts =
    (planState.metadata?.conflictArbitration as { conflicts?: Array<{ description?: string; severity?: string; affectedDays?: number[] }> } | undefined)
      ?.conflicts ?? [];

  for (const c of feasibilityConflicts) {
    if (!c.description) continue;
    checks.push({
      id: `conflict_${checks.length}`,
      label: c.description,
      status: c.severity === 'critical' || c.severity === 'high' ? 'blocked' : 'need_confirm',
      affectedDays: c.affectedDays,
    });
  }

  let status: PlanGateDimensionStatus = mapGateToDimensionStatus(
    gate.guardianResults?.abu?.verdict === 'REJECT' ? 'REJECT' : gate.status === 'REJECT' ? 'REJECT' : undefined,
    infeasible > 0 || gate.status === 'REJECT',
  );

  if (status === 'pass' && (gate.missingEvidence?.length ?? 0) > 0) {
    status = 'insufficient_data';
  }
  if (status === 'pass' && checks.some((c) => c.status === 'need_confirm')) {
    status = 'need_confirm';
  }
  if (checks.some((c) => c.status === 'blocked')) {
    status = 'blocked';
  }

  const summary =
    status === 'pass'
      ? '道路、交通与硬约束检查通过'
      : checks[0]?.label ?? '存在安全或可行性问题';

  return {
    key: 'safetyFeasibility',
    title: DIMENSION_TITLES.safetyFeasibility,
    status,
    summary,
    checks: checks.length ? checks : undefined,
  };
}

function buildPaceDimension(planState: PlanState): PlanGateVerificationDimensionDto {
  const checks: PlanGateVerificationCheckItemDto[] = [];
  const fatigue = planState.pace.fatigueScore;
  const dre = planState.gate?.guardianResults?.drdre;

  if (fatigue) {
    if (fatigue.paceScore >= 75) {
      checks.push({
        id: 'pace_score_high',
        label: `整体节奏负荷偏高（${fatigue.paceScore}/100）`,
        status: fatigue.paceScore >= 90 ? 'need_confirm' : 'suggest_adjust',
      });
    }
    for (const driver of fatigue.fatigueDrivers ?? []) {
      if (driver.severity >= 60) {
        checks.push({
          id: `fatigue_${driver.type}`,
          label: driver.description || driver.type,
          status: driver.severity >= 80 ? 'need_confirm' : 'suggest_adjust',
        });
      }
    }
  }

  if (dre?.evidence?.length) {
    for (const ev of dre.evidence) {
      checks.push({
        id: `dre_evidence_${checks.length}`,
        label: String(ev),
        status: dre.verdict === 'REJECT' ? 'blocked' : dre.verdict === 'ADJUST' ? 'suggest_adjust' : 'need_confirm',
      });
    }
  }

  const paceConflicts: Array<{ description: string; severity?: string; affectedDays?: number[] }> = [];
  for (const c of paceConflicts) {
    checks.push({
      id: `pace_conflict_${checks.length}`,
      label: c.description,
      status: c.severity === 'critical' ? 'blocked' : 'need_confirm',
      affectedDays: c.affectedDays,
    });
  }

  let status = mapGateToDimensionStatus(dre?.verdict, dre?.verdict === 'REJECT');
  if (status === 'pass' && checks.length) {
    status = worstStatus(checks.map((c) => c.status));
  }

  return {
    key: 'paceLoad',
    title: DIMENSION_TITLES.paceLoad,
    status,
    summary:
      status === 'pass'
        ? '每日节奏与成员负荷在可接受范围'
        : checks[0]?.label ?? '节奏与负荷需确认',
    checks: checks.length ? checks : undefined,
  };
}

function buildExperienceDimension(planState: PlanState): PlanGateVerificationDimensionDto {
  const checks: PlanGateVerificationCheckItemDto[] = [];
  const neptune = (planState.gate ?? {}).guardianResults?.neptune;
  const segmentCount = planState.itinerary?.segments?.length ?? 0;

  if (segmentCount === 0) {
    checks.push({
      id: 'empty_itinerary',
      label: '方案草案尚无完整日程',
      status: 'insufficient_data',
    });
  }

  if (neptune?.evidence?.length) {
    for (const ev of neptune.evidence) {
      checks.push({
        id: `neptune_evidence_${checks.length}`,
        label: String(ev),
        status:
          neptune.verdict === 'REJECT'
            ? 'blocked'
            : neptune.verdict === 'REPLACE'
              ? 'suggest_adjust'
              : 'need_confirm',
      });
    }
  }

  if (planState.budget.overrun && planState.budget.overrun.overrunAmount > 0) {
    const currency = planState.constraints.budget?.currency ?? 'CNY';
    checks.push({
      id: 'budget_overrun',
      label: `预算预估超出 ${planState.budget.overrun.overrunAmount} ${currency}`,
      status: 'need_confirm',
    });
  }

  let status = mapGateToDimensionStatus(neptune?.verdict, neptune?.verdict === 'REJECT');
  if (status === 'pass' && checks.length) {
    status = worstStatus(checks.map((c) => c.status));
  }

  return {
    key: 'experienceCompleteness',
    title: DIMENSION_TITLES.experienceCompleteness,
    status,
    summary:
      status === 'pass'
        ? '核心体验与行程完整性良好'
        : checks[0]?.label ?? '体验完整性需确认',
    checks: checks.length ? checks : undefined,
  };
}

function buildDraftLabel(planState: PlanState): string {
  const metaLabel = planState.metadata?.draftLabel as string | undefined;
  if (metaLabel) return metaLabel;
  return `A${planState.plan_version ?? 1}`;
}

function buildPendingConfirmations(
  uiOutput: PlanningWorkbenchResponse['uiOutput'],
  planState: PlanState,
  signOffLayers: DecisionLayers,
  presentation?: GuardianPersonaPresentation,
): PlanGatePendingConfirmationDto[] {
  const pending: PlanGatePendingConfirmationDto[] = [];

  signOffLayers.confirmations.forEach((text, index) => {
    pending.push({
      id: `signoff_${index}`,
      title: '提交前确认',
      description: text,
      kind: 'sign_off',
      severity: 'need_confirm',
    });
  });

  const points = presentation?.humanDecisionPoints ?? [];
  for (const point of points) {
    const options = (point.options ?? []).map((label, i) => ({
      id: point.optionIds?.[i] ?? `opt_${i}`,
      label,
      recommended: point.recommendation === label || point.recommendation === point.optionIds?.[i],
    }));
    if (options.length < 2) continue;

    pending.push({
      id: `tradeoff_${point.id}`,
      title: point.question || '确认本次取舍',
      description: point.question,
      kind: 'trade_off',
      severity: 'need_confirm',
      options,
      recommendedOptionId: options.find((o) => o.recommended)?.id,
    });
  }

  const stored = planState.metadata?.planGateConfirmations as
    | PlanGatePendingConfirmationDto[]
    | undefined;
  if (stored?.length && pending.length === 0) {
    return stored;
  }

  return pending;
}

function computeOverallStatus(
  dimensions: PlanGateVerificationDimensionDto[],
  hardBlocked: boolean,
  gateStatus: PlanState['gate']['status'],
  pendingCount: number,
): PlanGateOverallStatus {
  if (hardBlocked || gateStatus === 'REJECT') return 'blocked';
  const dimWorst = worstStatus(dimensions.map((d) => d.status));
  if (dimWorst === 'blocked') return 'blocked';
  if (dimWorst === 'insufficient_data') return 'insufficient_data';
  if (pendingCount > 0 || gateStatus === 'NEED_CONFIRM' || dimWorst === 'need_confirm') {
    return 'need_confirm';
  }
  if (gateStatus === 'SUGGEST_REPLACE' || dimWorst === 'suggest_adjust') {
    return 'suggest_adjust';
  }
  return 'pass';
}

function buildMetrics(planState: PlanState): PlanGateUiDto['verification']['metrics'] {
  const currency = planState.constraints.budget?.currency ?? 'CNY';
  const categories = planState.budget?.breakdown?.categories ?? [];
  const totalEstimate = categories.reduce((sum, c) => sum + (c.estimated ?? 0), 0);
  const baseline = planState.metadata?.baselineMetrics as
    | { executability?: number; budgetPerPerson?: number; drivingMinutes?: number }
    | undefined;

  const executabilityTo = planState.metadata?.executabilityScore as number | undefined;
  const drivingMinutes = planState.itinerary?.segments?.reduce(
    (sum, s) => sum + (s.metadata?.drivingMinutes as number | undefined ?? 0),
    0,
  );

  return {
    executability:
      baseline?.executability != null || executabilityTo != null
        ? { from: baseline?.executability, to: executabilityTo }
        : undefined,
    budgetPerPerson:
      totalEstimate > 0
        ? {
            from: baseline?.budgetPerPerson,
            to: totalEstimate,
            delta: baseline?.budgetPerPerson != null ? totalEstimate - baseline.budgetPerPerson : undefined,
            currency,
          }
        : undefined,
    totalDrivingMinutes:
      drivingMinutes > 0
        ? {
            from: baseline?.drivingMinutes,
            to: drivingMinutes,
            delta:
              baseline?.drivingMinutes != null
                ? drivingMinutes - baseline.drivingMinutes
                : undefined,
          }
        : undefined,
    affectedDays: planState.metadata?.affectedDays as number | undefined,
    affectedMembers: planState.metadata?.affectedMembers as number | undefined,
  };
}

export function buildPlanGateSubmitEligibility(input: {
  overallStatus: PlanGateOverallStatus;
  pendingConfirmations: PlanGatePendingConfirmationDto[];
  confirmedItems?: PlanGateConfirmedItemDto[];
  hardBlocked: boolean;
  extraBlockers?: string[];
}): PlanGateSubmitEligibilityDto {
  const requiredConfirmationIds = input.pendingConfirmations.map((p) => p.id);
  const satisfiedConfirmationIds = (input.confirmedItems ?? [])
    .filter((c) => c.accepted)
    .map((c) => c.confirmationId);

  const missingConfirmations = requiredConfirmationIds.filter(
    (id) => !satisfiedConfirmationIds.includes(id),
  );

  const blockers: string[] = [];
  if (input.hardBlocked) {
    blockers.push('存在硬约束冲突，需先返回决策空间或调整方案');
  }
  if (input.overallStatus === 'blocked') {
    blockers.push('方案验证存在阻塞项，不允许提交');
  }
  if (input.overallStatus === 'insufficient_data') {
    blockers.push('关键验证数据不足，请补充信息或重新生成草案');
  }
  for (const id of missingConfirmations) {
    const item = input.pendingConfirmations.find((p) => p.id === id);
    blockers.push(`待确认：${item?.title ?? id}`);
  }
  for (const extra of input.extraBlockers ?? []) {
    if (!blockers.includes(extra)) blockers.push(extra);
  }

  let mode: PlanGateSubmitMode = 'ready';
  if (input.overallStatus === 'blocked' || input.hardBlocked) {
    mode = 'blocked';
  } else if (input.overallStatus === 'insufficient_data') {
    mode = 'insufficient_data';
  } else if (missingConfirmations.length > 0) {
    mode = 'pending_confirmations';
  }

  const canSubmitToTimeline =
    mode === 'ready' &&
    (input.overallStatus === 'pass' || input.overallStatus === 'suggest_adjust');

  const canSubmitWithAcceptedRisk =
    mode === 'ready' ||
    (mode === 'pending_confirmations' &&
      missingConfirmations.length === 0 &&
      input.overallStatus === 'need_confirm');

  return {
    mode,
    canSubmitToTimeline,
    canSubmitWithAcceptedRisk: canSubmitWithAcceptedRisk && blockers.length === 0,
    blockers,
    requiredConfirmationIds,
    satisfiedConfirmationIds,
  };
}

export function projectPlanGateUi(input: {
  planState: PlanState;
  uiOutput: PlanningWorkbenchResponse['uiOutput'];
  consolidatedStatus?: WorkbenchConsolidatedDecisionStatus;
  confirmedItems?: PlanGateConfirmedItemDto[];
  extraSubmitBlockers?: string[];
}): PlanGateUiDto {
  const { planState, uiOutput } = input;
  const presentation = uiOutput.presentation ?? uiOutput.personas?.presentation;
  const hardBlocked = presentation
    ? (presentation.hardConstraintBlocked ?? resolveHardConstraintBlocked(presentation))
    : planState.gate?.status === 'REJECT';

  const status =
    input.consolidatedStatus ??
    (uiOutput.consolidatedDecision?.status as WorkbenchConsolidatedDecisionStatus | undefined) ??
    (planState.gate?.status === 'ALLOW' ? 'ALLOW' : 'NEED_CONFIRM');

  const signOffLayers = uiOutput.personas
    ? splitDecisionLayers({ uiOutput, planState, status })
    : {
        summary: buildRiskFactSummary(planState, uiOutput.personas, presentation),
        confirmations: uiOutput.confirmations ?? [],
        nextSteps: uiOutput.consolidatedDecision?.nextSteps ?? [],
      };

  const dimensions = [
    buildSafetyDimension(planState),
    buildPaceDimension(planState),
    buildExperienceDimension(planState),
  ];

  const pendingConfirmations = buildPendingConfirmations(
    uiOutput,
    planState,
    signOffLayers,
    presentation,
  );

  const overallStatus = computeOverallStatus(
    dimensions,
    hardBlocked,
    planState.gate?.status ?? 'NEED_CONFIRM',
    pendingConfirmations.length,
  );

  const verification: PlanGateUiDto['verification'] = {
    draftLabel: buildDraftLabel(planState),
    overallStatus,
    dimensions,
    pendingConfirmations: pendingConfirmations.length ? pendingConfirmations : undefined,
    metrics: buildMetrics(planState),
    headline: signOffLayers.summary || undefined,
  };

  const submitEligibility = buildPlanGateSubmitEligibility({
    overallStatus,
    pendingConfirmations,
    confirmedItems: input.confirmedItems,
    hardBlocked,
    extraBlockers: input.extraSubmitBlockers,
  });

  return { verification, submitEligibility };
}

/** 将 async progress 0–100 映射到五步流水线 */
export function mapProgressToPipelineSteps(
  progress: number,
  failed?: boolean,
): PlanGatePipelineStepDto[] {
  const thresholds: Array<{ step: PlanGatePipelineStepId; until: number }> = [
    { step: 'merge_decisions', until: 15 },
    { step: 'restructure_itinerary', until: 35 },
    { step: 'compute_routes_timing', until: 60 },
    { step: 'check_budget_members', until: 85 },
    { step: 'pre_submit_verification', until: 100 },
  ];

  const order = thresholds.map((t) => t.step);
  let activeIndex = 0;
  for (let i = 0; i < thresholds.length; i++) {
    if (progress >= thresholds[i].until) {
      activeIndex = i + 1;
    } else {
      activeIndex = i;
      break;
    }
  }
  if (progress >= 100) activeIndex = order.length;

  return order.map((id, index) => {
    let status: PlanGatePipelineStepDto['status'] = 'pending';
    if (failed && index === activeIndex) status = 'failed';
    else if (index < activeIndex) status = 'completed';
    else if (index === activeIndex && progress < 100) status = 'running';
    else if (progress >= 100) status = 'completed';

    return {
      id,
      label: PIPELINE_LABELS[id],
      status,
    };
  });
}

export function validateConfirmedItemsForCommit(input: {
  pendingConfirmations: PlanGatePendingConfirmationDto[];
  confirmedItems?: PlanGateConfirmedItemDto[];
}): { code: string; message: string } | null {
  const required = input.pendingConfirmations.map((p) => p.id);
  if (required.length === 0) return null;

  const items = input.confirmedItems ?? [];
  if (items.length === 0) {
    return {
      code: 'MISSING_CONFIRMED_ITEMS',
      message: `commit 需要确认 ${required.length} 项取舍/风险签收，请传 confirmedItems`,
    };
  }

  const acceptedIds = new Set(
    items.filter((c) => c.accepted).map((c) => c.confirmationId),
  );
  const missing = required.filter((id) => !acceptedIds.has(id));
  if (missing.length > 0) {
    return {
      code: 'INCOMPLETE_CONFIRMED_ITEMS',
      message: `仍有 ${missing.length} 项未确认：${missing.join(', ')}`,
    };
  }

  for (const item of items) {
    if (!item.accepted) continue;
    const pending = input.pendingConfirmations.find((p) => p.id === item.confirmationId);
    if (pending?.kind === 'trade_off' && pending.options?.length) {
      if (!item.choiceId) {
        return {
          code: 'MISSING_TRADE_OFF_CHOICE',
          message: `取舍项 ${item.confirmationId} 需指定 choiceId`,
        };
      }
      const valid = pending.options.some((o) => o.id === item.choiceId);
      if (!valid) {
        return {
          code: 'INVALID_TRADE_OFF_CHOICE',
          message: `取舍项 ${item.confirmationId} 的 choiceId 无效`,
        };
      }
    }
  }

  return null;
}

export function collectPendingConfirmationsForValidation(
  planState: PlanState,
  uiOutput?: PlanningWorkbenchResponse['uiOutput'],
): PlanGatePendingConfirmationDto[] {
  const minimalUi = uiOutput ?? {
    confirmations: planState.gate?.requiredUserConfirmations,
  };
  const gateUi = projectPlanGateUi({ planState, uiOutput: minimalUi });
  return gateUi.verification.pendingConfirmations ?? [];
}
