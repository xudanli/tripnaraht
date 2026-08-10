/**
 * Conversation Card Assembler — 将业务源投影为统一 ConversationTurnResult。
 */

import { adaptApplyReceiptFromApplySource } from './adapters/from-apply-receipt';
import { adaptTripFactFromDataLookup } from './adapters/from-data-lookup';
import { adaptGateRiskFromGate } from './adapters/from-gate';
import { adaptImportPreviewFromGuideToPlan } from './adapters/from-guide-to-plan';
import { adaptChangeDraftFromItineraryAdjust } from './adapters/from-itinerary-adjust';
import { adaptTeamActionFromTeamSource } from './adapters/from-team-action';
import { adaptDecisionOptionsFromTradeoff } from './adapters/from-tradeoff-cognition';
import {
  CONVERSATION_TURN_RESULT_SCHEMA_ID,
  CONVERSATION_TURN_RESULT_VERSION,
  type ConversationCardKind,
  type ConversationLifecycle,
} from './conversation-turn-result.constants';
import type {
  ConversationActionV1,
  ConversationCardV1,
  ConversationTurnResultV1,
  TripConversationContextSnapshotV1,
} from './conversation-turn-result.types';
import { resolveConversationLifecycle } from './resolve-conversation-lifecycle.util';
import { preferPrimaryCardForLifecycle } from './lifecycle-primary-card.util';

export type ConversationAssembleInput = {
  request_id: string;
  trip_id?: string | null;
  answer_text: string;
  result_status?: string | null;
  delivery_verdict?: string | null;
  user_confirm_required?: boolean;
  flawed_present?: boolean;
  lifecycle?: ConversationLifecycle;
  trip_status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  today_ymd?: string | null;
  context?: TripConversationContextSnapshotV1 | null;
  /** 强制 primary；否则按优先级推断 */
  prefer_primary?: ConversationCardKind;
  /** TRAVELING 执行态：天气/道路影响优先 gate_risk */
  traveling_execution_focus?: boolean;

  data_lookup?: Parameters<typeof adaptTripFactFromDataLookup>[0];
  itinerary_adjust?: Parameters<typeof adaptChangeDraftFromItineraryAdjust>[0];
  tradeoff?: Parameters<typeof adaptDecisionOptionsFromTradeoff>[0];
  gate?: Parameters<typeof adaptGateRiskFromGate>[0];
  guide_to_plan?: Parameters<typeof adaptImportPreviewFromGuideToPlan>[0];
  team?: Parameters<typeof adaptTeamActionFromTeamSource>[0];
  apply?: Parameters<typeof adaptApplyReceiptFromApplySource>[0];
};

const PRIMARY_PRIORITY: ConversationCardKind[] = [
  'apply_receipt',
  'import_preview',
  'change_draft',
  'decision_options',
  'gate_risk',
  'team_action',
  'trip_fact',
];

function pickPrimary(
  kinds: ConversationCardKind[],
  prefer?: ConversationCardKind,
  travelingExecutionFocus?: boolean,
): ConversationCardKind {
  if (prefer && kinds.includes(prefer)) return prefer;
  if (travelingExecutionFocus && kinds.includes('gate_risk')) return 'gate_risk';
  for (const k of PRIMARY_PRIORITY) {
    if (kinds.includes(k)) return k;
  }
  return kinds[0] ?? 'trip_fact';
}

/**
 * 组装统一对话结果信封。
 */
export function assembleConversationTurnResult(
  input: ConversationAssembleInput,
): ConversationTurnResultV1 {
  const cards: ConversationCardV1[] = [];
  const actions: ConversationActionV1[] = [];

  const push = (
    part: { card: ConversationCardV1; actions: ConversationActionV1[] } | null,
  ) => {
    if (!part) return;
    cards.push(part.card);
    actions.push(...part.actions);
  };

  // TRAVELING 执行态：先投影 gate，便于 primary 选中
  if (input.traveling_execution_focus) {
    push(
      adaptGateRiskFromGate(
        input.gate ?? {
          conclusion_zh: input.answer_text,
          gate_result: 'ALLOW',
        },
      ),
    );
  }

  push(adaptApplyReceiptFromApplySource(input.apply ?? {}));
  push(adaptImportPreviewFromGuideToPlan(input.guide_to_plan ?? {}));
  push(adaptChangeDraftFromItineraryAdjust(input.itinerary_adjust ?? {}));
  push(adaptDecisionOptionsFromTradeoff(input.tradeoff ?? {}));
  if (!input.traveling_execution_focus) {
    push(adaptGateRiskFromGate(input.gate ?? {}));
  }
  push(adaptTeamActionFromTeamSource(input.team ?? {}));
  push(
    adaptTripFactFromDataLookup(
      input.data_lookup ?? { answer_text: input.answer_text },
    ),
  );

  // 兜底：至少一张 trip_fact
  if (!cards.length) {
    cards.push({
      kind: 'trip_fact',
      title_zh: '回复',
      body_zh: String(input.answer_text ?? '').trim() || '暂无结构化卡片。',
      source: 'fallback',
    });
  }

  // 去重同 kind（保留首次）
  const seen = new Set<string>();
  const deduped = cards.filter((c) => {
    if (seen.has(c.kind)) return false;
    seen.add(c.kind);
    return true;
  });

  const lifecycle: ConversationLifecycle =
    input.context?.lifecycle ??
    input.lifecycle ??
    resolveConversationLifecycle({
      tripStatus: input.trip_status,
      startDate: input.start_date,
      endDate: input.end_date,
      todayYmd: input.today_ymd,
    });

  const kinds = deduped.map((c) => c.kind);
  const primary =
    input.prefer_primary && kinds.includes(input.prefer_primary)
      ? input.prefer_primary
      : preferPrimaryCardForLifecycle({
          lifecycle,
          available: kinds,
          travelingExecutionFocus:
            input.traveling_execution_focus || lifecycle === 'TRAVELING',
        }) ??
        pickPrimary(
          kinds,
          input.prefer_primary,
          input.traveling_execution_focus || lifecycle === 'TRAVELING',
        );

  // action 去重 by id
  const actionSeen = new Set<string>();
  const dedupActions = actions.filter((a) => {
    const id = a.id || a.kind;
    if (actionSeen.has(id)) return false;
    actionSeen.add(id);
    return true;
  });

  const verdict =
    String(input.delivery_verdict ?? '').trim() ||
    (String(input.result_status ?? '').toUpperCase() === 'OK' ? 'VERIFIED' : 'FAILED');

  const tripId = input.trip_id ?? input.context?.trip_id ?? undefined;

  return {
    schema_id: CONVERSATION_TURN_RESULT_SCHEMA_ID,
    version: CONVERSATION_TURN_RESULT_VERSION,
    request_id: input.request_id,
    ...(tripId ? { trip_id: tripId } : {}),
    lifecycle,
    primary_card: primary,
    cards: deduped,
    actions: dedupActions,
    delivery: {
      verdict,
      user_confirm_required: input.user_confirm_required === true,
      flawed_present: input.flawed_present === true,
    },
    answer_text: String(input.answer_text ?? ''),
    ...(input.context
      ? {
          context: input.context,
          context_ref: {
            trip_id: input.context.trip_id,
            ...(input.context.plan_version != null
              ? { plan_version: input.context.plan_version }
              : {}),
          },
        }
      : tripId
        ? { context_ref: { trip_id: tripId } }
        : {}),
  };
}

/**
 * 从已组装的 route_and_run payload 碎片提取 Assembler 输入（双写挂载用）。
 */
export function buildAssembleInputFromPayloadFragments(params: {
  request_id: string;
  trip_id?: string | null;
  answer_text: string;
  result_status?: string | null;
  payload?: Record<string, unknown> | null;
  trusted_delivery_v1?: {
    delivery_verdict?: string;
    user_confirm?: { required?: boolean };
    flawed_disclosure?: { present?: boolean };
  } | null;
  context?: TripConversationContextSnapshotV1 | null;
  traveling_execution_focus?: boolean;
  import_intent_hint?: boolean;
  guide_to_plan_session?: {
    session_id?: string;
    summary_zh?: string;
    status?: 'stub' | 'parsed' | 'matched' | 'conflict' | 'ready_to_write';
    matched_day_iso?: string;
    conflicts_zh?: string[];
    missing_zh?: string[];
  } | null;
  notify_member_ids?: string[];
}): ConversationAssembleInput {
  const p = params.payload ?? {};
  const td = params.trusted_delivery_v1;
  const uiDisplay = (p.ui_display as Record<string, unknown> | undefined) ?? {};
  const cognitionCards = uiDisplay.cognition_cards as ConversationAssembleInput['tradeoff'] extends
    | infer T
    | undefined
    ? T extends { cognition_cards?: infer C }
      ? C
      : never
    : never;

  const gateResult =
    (p.gate_result as { gate_result?: string } | undefined)?.gate_result ??
    (typeof p.gate_result === 'string' ? p.gate_result : null);

  return {
    request_id: params.request_id,
    trip_id: params.trip_id,
    answer_text: params.answer_text,
    result_status: params.result_status,
    delivery_verdict: td?.delivery_verdict,
    user_confirm_required: td?.user_confirm?.required === true,
    flawed_present: td?.flawed_disclosure?.present === true,
    context: params.context ?? undefined,
    traveling_execution_focus: params.traveling_execution_focus,
    data_lookup: {
      answer_text: params.answer_text,
      consultation_dashboard: (p.consultation_dashboard as Record<string, unknown>) ?? null,
      day_view: (p.day_view as {
        date_iso?: string;
        title_zh?: string;
        body_zh?: string;
      } | null) ?? null,
      source: p.day_view
        ? 'day_view'
        : String(p.ui_surface ?? 'data_lookup'),
    },
    itinerary_adjust: {
      itinerary_adjust: (() => {
        const raw =
          (p.itinerary_adjust_result as Record<string, unknown>) ??
          (p.itinerary_adjust as Record<string, unknown>) ??
          null;
        if (!raw) return null;
        // Phase 5：统一 before/after 字段供 change_draft 卡
        return {
          ...raw,
          title_zh: raw.title_zh ?? raw.display_title_zh ?? '行程变更草案',
          after_summary_zh:
            raw.after_summary_zh ??
            raw.draft_schedule_zh ??
            undefined,
          before_summary_zh:
            raw.before_summary_zh ??
            raw.previous_schedule_zh ??
            undefined,
          schedule_change_bullets_zh: raw.schedule_change_bullets_zh,
          draft_schedule_zh: raw.draft_schedule_zh,
        };
      })(),
      enriched_adjust: (p.itinerary_adjust_result as Record<string, unknown>) ?? null,
    },
    tradeoff: {
      cognition_cards: (cognitionCards as any) ?? null,
      negotiation_payload: (p.negotiation_payload as any) ?? null,
      travel_decision_problem: (p.travel_decision_problem as any) ?? null,
      requires_consent:
        String(params.result_status ?? '').toUpperCase() === 'NEED_CONSENT' ||
        String(params.result_status ?? '').toUpperCase() === 'NEED_CONFIRMATION' ||
        Boolean(p.travel_decision_problem),
    },
    gate: {
      gate_result: gateResult,
      // 不把普通答问 answer_text 灌进 gate（避免误生成 gate_risk）
      answer_text: gateResult ? params.answer_text : undefined,
      has_hard: String(gateResult ?? '').toUpperCase() === 'BLOCK',
      conclusion_zh:
        ((p as any).__traveling_execution_conclusion?.conclusion_zh as string) ||
        undefined,
      rationale_zh:
        ((p as any).__traveling_execution_conclusion?.rationale_zh as string) ||
        undefined,
      alternatives_zh: Array.isArray(
        (p as any).__traveling_execution_conclusion?.alternatives_zh,
      )
        ? ((p as any).__traveling_execution_conclusion.alternatives_zh as string[])
        : undefined,
    },
    guide_to_plan: params.guide_to_plan_session
      ? {
          session_id: params.guide_to_plan_session.session_id,
          summary_zh: params.guide_to_plan_session.summary_zh,
          status: params.guide_to_plan_session.status,
          matched_day_iso: params.guide_to_plan_session.matched_day_iso,
          conflicts_zh: params.guide_to_plan_session.conflicts_zh,
          missing_zh: params.guide_to_plan_session.missing_zh,
        }
      : { import_intent_hint: params.import_intent_hint === true },
    team: {
      suggested_operations: (p.suggested_operations as any) ?? null,
      team_fitness_submission_status:
        (p.team_fitness_submission_status as any) ?? null,
      answer_text: params.answer_text,
      notify_member_ids: params.notify_member_ids,
    },
    apply: {
      itinerary_adjust_apply_result:
        (p.itinerary_adjust_apply_result as Record<string, unknown>) ?? null,
      plan_diff: (p.plan_diff as any) ?? null,
      applied: (p.itinerary_adjust_apply_result as any)?.applied === true,
      plan_version_from: (p as any).replan_previous_plan_version,
      plan_version_to: (p as any).replan_new_plan_version ?? (p as any).plan_version,
      ai_operation_log: td
        ? ((params.trusted_delivery_v1 as any)?.ai_operation_log ?? null)
        : null,
      can_rollback: (p.itinerary_adjust_apply_result as any)?.applied === true,
      notified_member_ids: params.notify_member_ids,
    },
  };
}
