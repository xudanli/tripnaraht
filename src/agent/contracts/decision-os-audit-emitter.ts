import type { Logger } from '@nestjs/common';
import { normalizeDecisionOsAuditContract } from './decision-os-audit.contract';

export interface DecisionOsAuditEmitInput {
  request_id: string;
  phase: string;
  terminal?: boolean;
  dominant_cid?: string;
  session_consistency_score?: number;
  delta_reason?: string;
  delta_utility?: number;
  intent_revision_flag?: boolean;
  extra?: Record<string, unknown>;
}

export function buildDecisionOsAuditReport(input: DecisionOsAuditEmitInput): Record<string, unknown> {
  return {
    dominant_cid: input.dominant_cid ?? 'unknown.unattributed',
    session_consistency_score: input.session_consistency_score ?? 95,
    predictive_feedback_then_repair: {
      intent_revision_flag: input.intent_revision_flag ?? false,
      drift_vector: {
        delta_reason: input.delta_reason ?? 'aligned',
        delta_utility: input.delta_utility ?? 0,
      },
    },
    ...(input.extra ?? {}),
  };
}

/**
 * 原子审计打点：DONE/FAIL 路径必须产出 decision_os_audit_report（不阻断业务流）。
 */
export function emitDecisionOsAuditReport(
  logger: Logger,
  input: DecisionOsAuditEmitInput,
) {
  const normalized = normalizeDecisionOsAuditContract(buildDecisionOsAuditReport(input));
  const deltaReason = normalized.delta_reason;
  const delta_reason_kind =
    deltaReason === 'aligned' ? ('aligned' as const) : deltaReason ? ('mismatch' as const) : ('unknown' as const);

  logger.log(
    JSON.stringify({
      event: 'decision_os_audit_report',
      phase: input.phase,
      terminal: input.terminal ?? true,
      request_id: input.request_id,
      dominant_cid: normalized.dominant_cid,
      session_consistency_score: normalized.session_consistency_score,
      delta_reason_kind,
      is_intent_revised: normalized.intent_revision_flag,
      audit_report: normalized.audit_report,
      ...(input.extra ?? {}),
    }),
  );

  return normalized;
}

/** shadow / compare 等路径：legacy↔kernel 或 LLM↔gate 一致性评分 */
export function computeBridgeSessionConsistencyScore(input: {
  diverged: boolean;
  severityGap?: number;
}): number {
  if (!input.diverged) return 95;
  const gap = Math.max(0, input.severityGap ?? 1);
  return Math.max(40, 95 - gap * 15);
}
