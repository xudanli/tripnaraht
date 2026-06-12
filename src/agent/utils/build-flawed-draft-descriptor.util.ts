import type { DecisionState } from '../../decision/kernel/decision-state.types';
import type { OrchestrationResult } from '../interfaces/claude-orchestration.interface';
import type { GateResult, OrchestratorState } from '../interfaces/trip-plan.interface';
import type {
  FlawedDraftDescriptorV1,
  FlawedDraftReasonV1,
} from '../delivery/types/flawed-draft-v1.type';
import { parseMaxRepairCount } from '../orchestration/orchestration-governance-matrix.constants';

export function buildFlawedDraftDescriptorV1(input: {
  orchestrationResult: OrchestrationResult;
  gateResult?: GateResult | null;
  decisionState?: DecisionState;
  state?: OrchestratorState;
}): FlawedDraftDescriptorV1 | undefined {
  if (!input.orchestrationResult.success) {
    return undefined;
  }

  const reasons: FlawedDraftReasonV1[] = [];
  const gate = input.gateResult ?? input.orchestrationResult.result?.gate_result;
  const gateStatus = gate?.gate_result;
  const meta = (input.state?.metadata ?? input.orchestrationResult.result?.state?.metadata) as
    | Record<string, unknown>
    | undefined;
  const repairCount =
    input.decisionState?.systemState?.repairCount ??
    (typeof meta?.repair_count === 'number' ? meta.repair_count : undefined);
  const maxRepairCount = parseMaxRepairCount();

  if (meta?.flawed_draft_narrate === true) {
    const reasonCode = String(meta.flawed_draft_reason ?? 'REPAIR_BUDGET_EXCEEDED');
    if (reasonCode === 'UTILITY_DECAY_BYPASSED') {
      reasons.push({
        code: 'UTILITY_DECAY_BYPASSED',
        detail_zh: '自动修复后期望效用连续下降；已按 allow_flawed_draft_narrate 继续交付草案。',
      });
    } else {
      reasons.push({
        code: 'REPAIR_BUDGET_EXCEEDED',
        detail_zh: `已达 REPAIR 预算（${repairCount ?? '?'} / ${maxRepairCount}），草案可能仍含未收敛冲突。`,
      });
    }
  }

  if (meta?.gate_relaxed_for_partial === true) {
    reasons.push({
      code: 'ALLOW_PARTIAL_GATE_RELAXED',
      detail_zh: 'allow_partial：日期等硬缺口已降级，草案待补充确认。',
    });
  }

  if (gateStatus === 'ADJUST_REQUIRED') {
    reasons.push({
      code: 'GATE_ADJUST_REQUIRED',
      detail_zh: '门控标记为需调整；部分约束可能尚未完全满足。',
    });
  }

  const verification = input.decisionState?.verification;
  const openIssues = verification?.issues?.filter((i) => i.class !== 'FATAL') ?? [];
  if (openIssues.length > 0) {
    reasons.push({
      code: 'UNRESOLVED_VERIFICATION',
      detail_zh: `VERIFY 仍剩 ${openIssues.length} 项未完全消解。`,
    });
  }

  if (
    typeof repairCount === 'number' &&
    maxRepairCount > 0 &&
    repairCount >= maxRepairCount &&
    meta?.flawed_draft_narrate !== true
  ) {
    reasons.push({
      code: 'REPAIR_BUDGET_EXCEEDED',
      detail_zh: `repairCount=${repairCount} 已达上限 ${maxRepairCount}（未启用 allow_flawed_draft_narrate 时通常不会 SUCCESS）。`,
    });
  }

  const violations = gate?.violations?.length ?? 0;
  if (violations > 0 && gateStatus !== 'ALLOW') {
    if (!reasons.some((r) => r.code === 'GATE_ADJUST_REQUIRED')) {
      reasons.push({
        code: 'VERIFY_PARTIAL',
        detail_zh: `门控/验证仍关联 ${violations} 条违规摘要。`,
      });
    }
  }

  if (reasons.length === 0) {
    return undefined;
  }

  const deduped = dedupeReasons(reasons);
  return {
    schemaId: 'tripnara.flawed_draft@v1',
    version: 1,
    is_flawed: true,
    reasons: deduped,
    ...(typeof repairCount === 'number' ? { repair_count: repairCount } : {}),
    max_repair_count: maxRepairCount,
    ...(gateStatus ? { gate_status: gateStatus } : {}),
    unresolved_verification_codes: openIssues
      .map((i) => String((i as { code?: string }).code ?? i.class ?? '').trim())
      .filter(Boolean),
    user_action_recommended: true,
    headline_zh: '当前行程为瑕疵草案：部分约束尚未完全收敛，请人工确认后再执行。',
    headline_en:
      'This itinerary is a flawed draft: some constraints are not fully resolved; please confirm before booking.',
  };
}

function dedupeReasons(reasons: FlawedDraftReasonV1[]): FlawedDraftReasonV1[] {
  const seen = new Set<string>();
  return reasons.filter((r) => {
    if (seen.has(r.code)) return false;
    seen.add(r.code);
    return true;
  });
}
