/**
 * Adjustment Runtime — Sprint 3 骨架。
 * Goal → Context Slice → Draft → Verify → Repair≤policy → Before/After → WAIT_CONFIRM → Apply → Receipt。
 * 不重写走廊 PLAN_GEN；Apply 委托现有 write 链（由调用方注入 applyFn）。
 */

import type { AgentTaskContractV1 } from './agent-task-contract.types';
import { assertCapability, isCapabilityAllowed } from './assert-task-capability.util';

export const ADJUSTMENT_DRAFT_SCHEMA = 'nara.adjustment_draft.v1' as const;

export type AdjustmentRuntimePhase =
  | 'GOAL'
  | 'CONTEXT'
  | 'DRAFT'
  | 'VERIFY'
  | 'REPAIR'
  | 'BEFORE_AFTER'
  | 'WAIT_CONFIRM'
  | 'CONFIRMED'
  | 'APPLY'
  | 'RECEIPT';

export type AdjustmentDraftStatus =
  | 'OPEN'
  | 'NEEDS_REPAIR'
  | 'WAIT_CONFIRM'
  | 'CONFIRMED'
  | 'APPLIED'
  | 'CANCELLED';

export type AdjustmentGoalV1 = {
  goalId: string;
  tripId?: string;
  taskId: string;
  questionZh: string;
  /** 受影响日（CASE-A01: [3]） */
  affectedDays: number[];
  intentKind: 'DAY_PACE' | 'LODGING_FILL' | 'REPLAN' | 'GENERIC_ADJUST';
};

export type AdjustmentDraftV1 = {
  schemaId: typeof ADJUSTMENT_DRAFT_SCHEMA;
  version: 1;
  draftId: string;
  goal: AdjustmentGoalV1;
  status: AdjustmentDraftStatus;
  beforeSummaryZh: string;
  afterSummaryZh: string;
  verifyOk: boolean;
  verifyNotesZh: string[];
  repairCount: number;
  maxRepairs: number;
  /** Confirm 前禁止写库 */
  applyAllowed: boolean;
  receipt?: AdjustmentReceiptV1;
  /** 可选：挂现有 pending draft 引用 */
  pendingRef?: string;
};

export type AdjustmentReceiptV1 = {
  actionId: string;
  previousVersion?: string;
  newVersion?: string;
  appliedAt: string;
  rollbackToken?: string;
  appliedToItinerary: boolean;
};

export type AdjustmentPipelineResultV1 = {
  draft: AdjustmentDraftV1;
  phasesCompleted: AdjustmentRuntimePhase[];
  awaitingConfirm: boolean;
};

export type AdjustmentRuntimeTraceV1 = {
  phase: AdjustmentRuntimePhase;
  draftId: string;
  taskId: string;
  allowCreateProposal: boolean;
  applyAllowed: boolean;
};

/** 进入 Adjustment：须 CREATE_PROPOSAL；Confirm 前不得 APPLY */
export function assertAdjustmentRuntimeEntry(contract: AgentTaskContractV1): AdjustmentRuntimeTraceV1 {
  if (contract.taskType !== 'ITINERARY_ADJUST') {
    throw new Error(
      `[AdjustmentRuntime] expected ITINERARY_ADJUST, got ${contract.taskType}`,
    );
  }
  const gate = assertCapability(contract, 'CREATE_PROPOSAL');
  if (gate.ok === false) {
    throw new Error(`[AdjustmentRuntime] ${gate.reason}`);
  }
  if (isCapabilityAllowed(contract, 'APPLY')) {
    throw new Error(
      `[AdjustmentRuntime] APPLY must not be allowed before user confirm (taskId=${contract.taskId})`,
    );
  }
  return {
    phase: 'GOAL',
    draftId: `adj_${contract.taskId}`,
    taskId: contract.taskId,
    allowCreateProposal: true,
    applyAllowed: false,
  };
}

export function parseAffectedDaysFromMessage(message: string): number[] {
  const m = String(message ?? '');
  const days = new Set<number>();
  for (const re of [
    /第\s*(\d+)\s*天/g,
    /\bDay\s*[-_]?\s*(\d+)\b/gi,
    /\bD\s*(\d+)\b/gi,
  ]) {
    let hit: RegExpExecArray | null;
    while ((hit = re.exec(m))) {
      const n = Number(hit[1]);
      if (Number.isFinite(n) && n >= 1 && n <= 60) days.add(n);
    }
  }
  return [...days].sort((a, b) => a - b);
}

export function detectAdjustmentIntentKind(
  message: string,
): AdjustmentGoalV1['intentKind'] {
  const m = String(message ?? '');
  if (/重新规划|整段重规划|全部重排|从头规划/.test(m)) return 'REPLAN';
  if (/安排住宿|补.*住宿|补齐住宿|缺住宿| overnight|lodging fill/i.test(m)) {
    return 'LODGING_FILL';
  }
  if (/轻松|节奏|少赶路|不要太满|pace/i.test(m)) return 'DAY_PACE';
  return 'GENERIC_ADJUST';
}

export function buildAdjustmentGoalFromContract(
  contract: AgentTaskContractV1,
  message: string,
): AdjustmentGoalV1 {
  assertAdjustmentRuntimeEntry(contract);
  const fromScope = contract.scope.days?.filter((d) => d >= 1) ?? [];
  const affectedDays =
    fromScope.length > 0 ? fromScope : parseAffectedDaysFromMessage(message);
  return {
    goalId: `goal_${contract.taskId}`,
    tripId: contract.tripId,
    taskId: contract.taskId,
    questionZh: String(message ?? '').trim().slice(0, 200) || '调整行程',
    affectedDays,
    intentKind: detectAdjustmentIntentKind(message),
  };
}

/**
 * Draft 管线至 WAIT_CONFIRM（不写库）。
 * verifyFn / repairFn 可选；默认 verify 通过、repair 0 次。
 */
export function runAdjustmentDraftPipeline(input: {
  contract: AgentTaskContractV1;
  message: string;
  beforeSummaryZh: string;
  afterSummaryZh: string;
  maxRepairs?: number;
  verifyFn?: (draft: AdjustmentDraftV1) => { ok: boolean; notesZh: string[] };
  repairFn?: (draft: AdjustmentDraftV1) => AdjustmentDraftV1;
  pendingRef?: string;
}): AdjustmentPipelineResultV1 {
  const phasesCompleted: AdjustmentRuntimePhase[] = ['GOAL', 'CONTEXT'];
  const goal = buildAdjustmentGoalFromContract(input.contract, input.message);
  phasesCompleted.push('DRAFT');

  let draft: AdjustmentDraftV1 = {
    schemaId: ADJUSTMENT_DRAFT_SCHEMA,
    version: 1,
    draftId: `adj_${input.contract.taskId}`,
    goal,
    status: 'OPEN',
    beforeSummaryZh: input.beforeSummaryZh,
    afterSummaryZh: input.afterSummaryZh,
    verifyOk: false,
    verifyNotesZh: [],
    repairCount: 0,
    maxRepairs: input.maxRepairs ?? 1,
    applyAllowed: false,
    pendingRef: input.pendingRef,
  };

  phasesCompleted.push('VERIFY');
  const verified = input.verifyFn?.(draft) ?? { ok: true, notesZh: ['骨架默认通过 VERIFY'] };
  draft = {
    ...draft,
    verifyOk: verified.ok,
    verifyNotesZh: verified.notesZh,
    status: verified.ok ? 'WAIT_CONFIRM' : 'NEEDS_REPAIR',
  };

  while (!draft.verifyOk && draft.repairCount < draft.maxRepairs) {
    phasesCompleted.push('REPAIR');
    draft = {
      ...(input.repairFn?.(draft) ?? {
        ...draft,
        afterSummaryZh: `${draft.afterSummaryZh}（已按策略轻量修复）`,
      }),
      repairCount: draft.repairCount + 1,
    };
    phasesCompleted.push('VERIFY');
    const again = input.verifyFn?.(draft) ?? { ok: true, notesZh: ['repair 后通过'] };
    draft = {
      ...draft,
      verifyOk: again.ok,
      verifyNotesZh: again.notesZh,
      status: again.ok ? 'WAIT_CONFIRM' : 'NEEDS_REPAIR',
    };
  }

  if (draft.verifyOk) {
    phasesCompleted.push('BEFORE_AFTER', 'WAIT_CONFIRM');
    draft = { ...draft, status: 'WAIT_CONFIRM', applyAllowed: false };
  }

  return {
    draft,
    phasesCompleted,
    awaitingConfirm: draft.status === 'WAIT_CONFIRM',
  };
}

/** Confirm：仅锁定草案，不 Apply */
export function confirmAdjustmentDraft(draft: AdjustmentDraftV1): AdjustmentDraftV1 {
  if (draft.status !== 'WAIT_CONFIRM') {
    throw new Error(`[AdjustmentRuntime] cannot confirm from status=${draft.status}`);
  }
  if (!draft.verifyOk) {
    throw new Error('[AdjustmentRuntime] cannot confirm unverified draft');
  }
  return {
    ...draft,
    status: 'CONFIRMED',
    applyAllowed: true,
  };
}

/**
 * Apply：须已 Confirm；实际写库由 applyFn 完成（委托 tryApplyBoundTrip…）。
 */
export async function applyConfirmedAdjustmentDraft(
  draft: AdjustmentDraftV1,
  applyFn: (draft: AdjustmentDraftV1) => Promise<{
    ok: boolean;
    actionId?: string;
    previousVersion?: string;
    newVersion?: string;
    rollbackToken?: string;
    errorZh?: string;
  }>,
): Promise<AdjustmentDraftV1> {
  if (draft.status !== 'CONFIRMED' || !draft.applyAllowed) {
    throw new Error(
      `[AdjustmentRuntime] APPLY forbidden until CONFIRMED (status=${draft.status})`,
    );
  }
  const result = await applyFn(draft);
  if (!result.ok) {
    throw new Error(result.errorZh ?? '[AdjustmentRuntime] applyFn failed');
  }
  const receipt: AdjustmentReceiptV1 = {
    actionId: result.actionId ?? `act_${draft.draftId}`,
    previousVersion: result.previousVersion,
    newVersion: result.newVersion,
    appliedAt: new Date().toISOString(),
    rollbackToken: result.rollbackToken,
    appliedToItinerary: true,
  };
  return {
    ...draft,
    status: 'APPLIED',
    receipt,
  };
}

export function projectAdjustmentDraftForTrace(draft: AdjustmentDraftV1): Record<string, unknown> {
  return {
    schema_id: draft.schemaId,
    draft_id: draft.draftId,
    task_id: draft.goal.taskId,
    status: draft.status,
    intent_kind: draft.goal.intentKind,
    affected_days: draft.goal.affectedDays,
    verify_ok: draft.verifyOk,
    repair_count: draft.repairCount,
    apply_allowed: draft.applyAllowed,
    awaiting_confirm: draft.status === 'WAIT_CONFIRM',
    applied_to_itinerary: draft.receipt?.appliedToItinerary === true,
    receipt_action_id: draft.receipt?.actionId ?? null,
  };
}

/** CASE-A02：Query CTA → 新 Adjustment task，不得复用 Query taskId */
export function assertNewAdjustmentTaskNotReusingQuery(input: {
  queryTaskId: string;
  adjustContract: AgentTaskContractV1;
}): void {
  if (input.adjustContract.taskType !== 'ITINERARY_ADJUST') {
    throw new Error('[AdjustmentRuntime] CTA must open ITINERARY_ADJUST task');
  }
  if (input.adjustContract.taskId === input.queryTaskId) {
    throw new Error('[AdjustmentRuntime] must not reuse Query taskId for Adjust');
  }
  if (input.adjustContract.authority !== 'DRAFT_REQUIRED') {
    throw new Error('[AdjustmentRuntime] adjust authority must be DRAFT_REQUIRED');
  }
}
