/**
 * Chat 改排草案 CTA：对齐住宿卡的 actions[] / primary_action 模式。
 * 写入走独立 Apply 端点（内部复用 apply_itinerary_adjust_draft），不是 decision_consent。
 */

export const ITINERARY_ADJUST_RESULT_SCHEMA = 'tripnara/chat_itinerary_adjust_result@v1';
export const APPLY_ITINERARY_ADJUST_ACTION = 'apply_itinerary_adjust';

export type ItineraryAdjustDraftSnapshotV1 = {
  target_date_iso: string;
  target_day_number?: number;
  apply_mode?: 'replace_day' | 'append_sparse_days';
  items?: Array<Record<string, unknown>>;
  days?: Array<{
    date_iso: string;
    day_number?: number;
    items?: Array<Record<string, unknown>>;
  }>;
};

export type ItineraryAdjustApplyGateV1 = {
  /** 前端是否应画「确认写入」 */
  can_apply: boolean;
  /** 可写时的建议 HTTP 路径（相对 /api/agent/chat） */
  apply_path: string;
  /** 禁止原因码；可写时为空 */
  deny_reason?:
    | 'already_applied'
    | 'no_draft_items'
    | 'flawed_draft'
    | 'missing_target_date'
    | 'personal_scope_forbidden'
    | 'unknown';
  /** FLAWED_DRAFT 禁止静默写入 */
  flawed_draft_forbidden: boolean;
};

function asRecord(v: unknown): Record<string, unknown> | null {
  return v && typeof v === 'object' && !Array.isArray(v)
    ? (v as Record<string, unknown>)
    : null;
}

function timelineDayItems(
  payload: Record<string, unknown>,
  targetDateIso: string,
): Array<Record<string, unknown>> {
  const timeline = payload.timeline;
  if (!Array.isArray(timeline)) return [];
  const day = timeline.find(
    (d) =>
      d &&
      typeof d === 'object' &&
      String((d as { date?: unknown }).date ?? '').slice(0, 10) === targetDateIso,
  ) as { items?: unknown } | undefined;
  return Array.isArray(day?.items)
    ? (day!.items as Array<Record<string, unknown>>)
    : [];
}

export function buildItineraryAdjustDraftId(params: {
  requestId?: string | null;
  targetDateIso: string;
  durableTripRunId?: string | null;
}): string {
  const req = String(params.requestId ?? '').trim() || 'req';
  const run = String(params.durableTripRunId ?? '').trim();
  const date = params.targetDateIso.slice(0, 10);
  return run ? `iad:${run}:${date}` : `iad:${req}:${date}`;
}

/**
 * 从 route_and_run 响应提取 chat 可落库的改排草案 + CTA。
 * 无草案 / 已应用 → 原样返回（不附 CTA）。
 */
export function enrichItineraryAdjustResultForChat(params: {
  adjust: Record<string, unknown>;
  payload: Record<string, unknown>;
  response: {
    request_id?: string;
    result?: { status?: string | null; payload?: unknown };
    observability?: Record<string, unknown> | null;
    durable?: { trip_run_id?: string | null } | null;
  };
  conversationId: string;
  deliveryVerdict?: string | null;
  chatScope?: 'PERSONAL' | 'TRIP_SHARED' | string | null;
}): Record<string, unknown> {
  const { adjust, payload, response, conversationId } = params;
  const targetDateIso = String(adjust.target_date_iso ?? '').slice(0, 10);
  const applied = adjust.applied === true;
  const mode = String(adjust.execution_mode ?? 'ADVICE_ONLY').toUpperCase();
  const verdict = String(params.deliveryVerdict ?? '').toUpperCase();
  const flawed = verdict === 'FLAWED_DRAFT';
  const personal = String(params.chatScope ?? '').toUpperCase() === 'PERSONAL';

  const durableTripRunId =
    String(
      response.durable?.trip_run_id ??
        response.observability?.durable_trip_run_id ??
        payload.durable_trip_run_id ??
        '',
    ).trim() || null;

  const itemsFromTimeline = targetDateIso
    ? timelineDayItems(payload, targetDateIso)
    : [];
  const existingSnapshot = asRecord(adjust.apply_snapshot) as ItineraryAdjustDraftSnapshotV1 | null;
  const items =
    (Array.isArray(existingSnapshot?.items) && existingSnapshot!.items!.length
      ? existingSnapshot!.items!
      : null) ??
    (itemsFromTimeline.length ? itemsFromTimeline : undefined);

  const draftSchedule = Array.isArray(adjust.draft_schedule_zh)
    ? adjust.draft_schedule_zh
    : [];
  const hasDraftItems =
    (items?.length ?? 0) > 0 ||
    draftSchedule.some((l) => String(l ?? '').trim().length > 0);

  let denyReason: ItineraryAdjustApplyGateV1['deny_reason'];
  if (applied) denyReason = 'already_applied';
  else if (!targetDateIso) denyReason = 'missing_target_date';
  else if (flawed) denyReason = 'flawed_draft';
  else if (personal) denyReason = 'personal_scope_forbidden';
  else if (!hasDraftItems) denyReason = 'no_draft_items';

  const canApply = !denyReason && mode !== 'AUTO'; // AUTO 已写库则走 already_applied
  const draftId =
    typeof adjust.draft_id === 'string' && adjust.draft_id.trim()
      ? adjust.draft_id.trim()
      : targetDateIso
        ? buildItineraryAdjustDraftId({
            requestId: response.request_id,
            targetDateIso,
            durableTripRunId,
          })
        : undefined;

  const applyPath = `conversations/${conversationId}/apply-itinerary-draft`;
  const applyGate: ItineraryAdjustApplyGateV1 = {
    can_apply: canApply,
    apply_path: applyPath,
    flawed_draft_forbidden: flawed,
    ...(denyReason ? { deny_reason: denyReason } : {}),
  };

  const applySnapshot: ItineraryAdjustDraftSnapshotV1 | undefined =
    targetDateIso && hasDraftItems
      ? {
          target_date_iso: targetDateIso,
          ...(adjust.target_day_number != null
            ? { target_day_number: Number(adjust.target_day_number) }
            : {}),
          apply_mode:
            (existingSnapshot?.apply_mode as 'replace_day' | 'append_sparse_days' | undefined) ??
            'replace_day',
          ...(items?.length ? { items } : {}),
          ...(Array.isArray(existingSnapshot?.days) ? { days: existingSnapshot!.days } : {}),
        }
      : undefined;

  if (!canApply) {
    return {
      ...adjust,
      ...(draftId ? { draft_id: draftId } : {}),
      ...(durableTripRunId ? { durable_trip_run_id: durableTripRunId } : {}),
      apply_gate: applyGate,
      // 明确不附 CTA，避免前端误画可点按钮
    };
  }

  const primaryAction = {
    action: APPLY_ITINERARY_ADJUST_ACTION,
    label: 'Confirm write',
    labelCN: '确认写入',
    params: {
      draft_id: draftId,
      target_date_iso: targetDateIso,
      ...(adjust.target_day_number != null
        ? { target_day_number: Number(adjust.target_day_number) }
        : {}),
      ...(durableTripRunId ? { durable_trip_run_id: durableTripRunId } : {}),
      ...(applySnapshot ? { apply_snapshot: applySnapshot } : {}),
      apply_path: applyPath,
      idempotency_key: draftId,
    },
  };

  return {
    ...adjust,
    draft_id: draftId,
    ...(durableTripRunId ? { durable_trip_run_id: durableTripRunId } : {}),
    ...(applySnapshot ? { apply_snapshot: applySnapshot } : {}),
    apply_gate: applyGate,
    cta_zh: '确认写入',
    actions: [primaryAction],
    primary_action: primaryAction,
  };
}
