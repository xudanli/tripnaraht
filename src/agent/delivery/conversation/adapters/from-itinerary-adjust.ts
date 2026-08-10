import type {
  ChangeDraftCardV1,
  ConversationActionV1,
} from '../conversation-turn-result.types';

export type ItineraryAdjustAssembleSource = {
  itinerary_adjust?: Record<string, unknown> | null;
  /** Chat enrich 后的字段亦可直接传入 */
  enriched_adjust?: Record<string, unknown> | null;
};

/**
 * ITINERARY_ADJUST → change_draft 卡（含 before/after 与 apply_gate）。
 */
export function adaptChangeDraftFromItineraryAdjust(
  src: ItineraryAdjustAssembleSource,
): { card: ChangeDraftCardV1; actions: ConversationActionV1[] } | null {
  const adj =
    (src.enriched_adjust && typeof src.enriched_adjust === 'object'
      ? src.enriched_adjust
      : null) ??
    (src.itinerary_adjust && typeof src.itinerary_adjust === 'object'
      ? src.itinerary_adjust
      : null);
  if (!adj) return null;

  const targetDate = String(adj.target_date_iso ?? '').slice(0, 10) || undefined;
  const draftSchedule = Array.isArray(adj.draft_schedule_zh)
    ? (adj.draft_schedule_zh as string[]).map(String)
    : undefined;
  const changeBullets = Array.isArray(adj.schedule_change_bullets_zh)
    ? (adj.schedule_change_bullets_zh as string[]).map(String)
    : undefined;
  const beforeSummary = Array.isArray(adj.before_summary_zh)
    ? (adj.before_summary_zh as string[]).map(String)
    : Array.isArray(adj.previous_schedule_zh)
      ? (adj.previous_schedule_zh as string[]).map(String)
      : undefined;
  const afterSummary =
    Array.isArray(adj.after_summary_zh)
      ? (adj.after_summary_zh as string[]).map(String)
      : draftSchedule;

  const hasSignal =
    targetDate ||
    (draftSchedule?.length ?? 0) > 0 ||
    (changeBullets?.length ?? 0) > 0 ||
    adj.draft_id ||
    adj.apply_gate;
  if (!hasSignal) return null;

  const applyGateRaw =
    adj.apply_gate && typeof adj.apply_gate === 'object'
      ? (adj.apply_gate as Record<string, unknown>)
      : null;

  const card: ChangeDraftCardV1 = {
    kind: 'change_draft',
    title_zh: String(adj.title_zh ?? '行程变更草案').trim() || '行程变更草案',
    target_date_iso: targetDate,
    ...(adj.target_day_number != null
      ? { target_day_number: Number(adj.target_day_number) }
      : {}),
    ...(typeof adj.draft_id === 'string' ? { draft_id: adj.draft_id } : {}),
    ...(beforeSummary?.length ? { before_summary_zh: beforeSummary } : {}),
    ...(afterSummary?.length ? { after_summary_zh: afterSummary } : {}),
    ...(changeBullets?.length ? { schedule_change_bullets_zh: changeBullets } : {}),
    ...(draftSchedule?.length ? { draft_schedule_zh: draftSchedule } : {}),
    ...(applyGateRaw
      ? {
          apply_gate: {
            can_apply: applyGateRaw.can_apply === true,
            ...(typeof applyGateRaw.apply_path === 'string'
              ? { apply_path: applyGateRaw.apply_path }
              : {}),
            ...(typeof applyGateRaw.deny_reason === 'string'
              ? { deny_reason: applyGateRaw.deny_reason }
              : {}),
            flawed_draft_forbidden: applyGateRaw.flawed_draft_forbidden === true,
          },
        }
      : {}),
    ...(adj.apply_snapshot && typeof adj.apply_snapshot === 'object'
      ? { apply_snapshot: adj.apply_snapshot as Record<string, unknown> }
      : {}),
    ...(adj.durable_trip_run_id != null
      ? { durable_trip_run_id: String(adj.durable_trip_run_id) }
      : {}),
    applied: adj.applied === true,
  };

  const actions: ConversationActionV1[] = [];
  const primary = adj.primary_action as Record<string, unknown> | undefined;
  if (primary && typeof primary === 'object' && applyGateRaw?.can_apply === true) {
    actions.push({
      id: String(primary.action ?? 'apply_itinerary_adjust'),
      kind: 'apply_itinerary_adjust',
      label_zh: String(primary.labelCN ?? primary.label ?? '确认写入'),
      label_en: typeof primary.label === 'string' ? primary.label : 'Confirm write',
      payload: (primary.params as Record<string, unknown>) ?? {},
    });
  }

  return { card, actions };
}
