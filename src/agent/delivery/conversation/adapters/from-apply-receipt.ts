import type {
  ApplyReceiptCardV1,
  ConversationActionV1,
} from '../conversation-turn-result.types';

export type ApplyReceiptAssembleSource = {
  applied?: boolean;
  summary_zh?: string;
  changed_summary_zh?: string[];
  affected_dates_iso?: string[];
  plan_version_from?: number | null;
  plan_version_to?: number | null;
  verification_passed?: boolean | null;
  unresolved_risks_zh?: string[];
  notified_member_ids?: string[];
  draft_id?: string;
  target_date_iso?: string;
  can_rollback?: boolean;
  plan_diff?: {
    version_from?: number;
    version_to?: number;
    changes?: Array<{ summary?: string; summary_zh?: string; date?: string }>;
  } | null;
  itinerary_adjust_apply_result?: Record<string, unknown> | null;
  ai_operation_log?: Array<{ label_zh?: string; summary?: string }> | null;
};

/**
 * Apply / plan_diff / op log → apply_receipt 卡。
 */
export function adaptApplyReceiptFromApplySource(
  src: ApplyReceiptAssembleSource,
): { card: ApplyReceiptCardV1; actions: ConversationActionV1[] } | null {
  const applyRes = src.itinerary_adjust_apply_result;
  const appliedFromRes = applyRes?.applied === true;
  const applied = src.applied === true || appliedFromRes;

  const diffChanges = (src.plan_diff?.changes ?? [])
    .map((c) => String(c.summary_zh ?? c.summary ?? '').trim())
    .filter(Boolean);

  const changed =
    src.changed_summary_zh?.length
      ? src.changed_summary_zh
      : diffChanges.length
        ? diffChanges
        : (src.ai_operation_log ?? [])
            .map((e) => String(e.label_zh ?? e.summary ?? '').trim())
            .filter(Boolean);

  const versionFrom =
    src.plan_version_from ?? src.plan_diff?.version_from ?? null;
  const versionTo = src.plan_version_to ?? src.plan_diff?.version_to ?? null;

  const affected =
    src.affected_dates_iso ??
    (src.plan_diff?.changes ?? [])
      .map((c) => (c.date ? String(c.date).slice(0, 10) : ''))
      .filter(Boolean);

  const targetFromApply =
    typeof applyRes?.target_date_iso === 'string'
      ? String(applyRes.target_date_iso).slice(0, 10)
      : src.target_date_iso;

  const hasSignal =
    applied ||
    changed.length > 0 ||
    versionTo != null ||
    Boolean(applyRes) ||
    Boolean(src.summary_zh);

  if (!hasSignal) return null;

  const summary =
    String(src.summary_zh ?? '').trim() ||
    (applied
      ? `已写入行程${versionTo != null ? `（v${versionTo}）` : ''}。`
      : changed.length
        ? changed.slice(0, 3).join('；')
        : '本轮操作回执。');

  const canRollback = src.can_rollback === true || applied;

  const card: ApplyReceiptCardV1 = {
    kind: 'apply_receipt',
    title_zh: applied ? '写入回执' : '操作回执',
    applied,
    summary_zh: summary,
    ...(changed.length ? { changed_summary_zh: changed.slice(0, 12) } : {}),
    ...(affected.length ? { affected_dates_iso: [...new Set(affected)] } : {}),
    plan_version_from: versionFrom,
    plan_version_to: versionTo,
    ...(src.verification_passed != null
      ? { verification_passed: src.verification_passed }
      : {}),
    ...(src.unresolved_risks_zh?.length
      ? { unresolved_risks_zh: src.unresolved_risks_zh }
      : {}),
    ...(src.notified_member_ids?.length
      ? { notified_member_ids: src.notified_member_ids }
      : {}),
    ...(typeof applyRes?.draft_id === 'string'
      ? { draft_id: String(applyRes.draft_id) }
      : src.draft_id
        ? { draft_id: src.draft_id }
        : {}),
    ...(targetFromApply ? { target_date_iso: targetFromApply } : {}),
    can_rollback: canRollback,
  };

  const actions: ConversationActionV1[] = [];
  if (canRollback) {
    actions.push({
      id: 'rollback',
      kind: 'rollback',
      label_zh: '撤销本次变更',
      payload: {
        ...(versionFrom != null ? { to_plan_version: versionFrom } : {}),
        ...(targetFromApply ? { target_date_iso: targetFromApply } : {}),
      },
    });
  }

  return { card, actions };
}
