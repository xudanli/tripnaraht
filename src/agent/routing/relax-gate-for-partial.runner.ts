/**
 * allow_partial 下日期缺口门控降级（纯函数，从 ClaudeOrchestrator 迁出）。
 */

import type { OrchestratorState } from '../interfaces/trip-plan.interface';

export function isDateOnlyDataMissingViolation(
  violations: Array<{ type?: string; detail?: string; severity?: string }>,
): boolean {
  if (!violations.length) return false;
  return violations.every((v) => {
    if (String(v?.type) !== 'DATA_MISSING') return false;
    const d = String(v?.detail || '');
    return /日期|date_range|start_date/i.test(d);
  });
}

export function relaxGateForPartialIfEligible(state: OrchestratorState): void {
  if (state.metadata?.allow_partial !== true) return;
  if (state.gate_result?.gate_result !== 'BLOCK') return;
  const violations = state.gate_result?.violations || [];
  if (!isDateOnlyDataMissingViolation(violations)) return;

  state.gate_result = {
    ...state.gate_result,
    gate_result: 'ADJUST_REQUIRED',
    required_adjustments: [
      ...(state.gate_result?.required_adjustments || []),
      {
        action: 'CHANGE_DATES',
        why: 'allow_partial=true：缺少日期时先生成草案，再补充日期确认',
      } as any,
    ],
  };
  state.metadata.gate_relaxed_for_partial = true;
  state.decision_log.push({
    request_id: state.request_id,
    step: 'GATE_EVAL',
    actor: 'Gatekeeper',
    inputs_summary: 'allow_partial 下日期缺口门控降级',
    outputs_summary: 'Gate 从 BLOCK 降级为 ADJUST_REQUIRED，继续生成草案',
    evidence_refs: [],
    timestamp: new Date().toISOString(),
    metadata: { duration_ms: 0, downgraded: true },
  });
}
