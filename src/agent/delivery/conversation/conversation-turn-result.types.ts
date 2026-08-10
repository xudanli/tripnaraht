/**
 * ConversationTurnResult + 七类标准卡片（冻结）。
 * 渠道（Chat / iOS）只做渲染，不解析内部编排对象。
 */

import type { DeliveryVerdict } from '../types/delivery-verdict.types';
import type {
  CONVERSATION_TURN_RESULT_SCHEMA_ID,
  ConversationActionKind,
  ConversationCardKind,
  ConversationLifecycle,
  TRIP_CONVERSATION_CONTEXT_SCHEMA_ID,
} from './conversation-turn-result.constants';

// ─── Context snapshot (Phase 2) ─────────────────────────────────────────────

export type TripConversationContextSnapshotV1 = {
  schema_id: typeof TRIP_CONVERSATION_CONTEXT_SCHEMA_ID;
  trip_id: string;
  plan_version?: number | null;
  lifecycle: ConversationLifecycle;
  /** Trip.status 原始值 */
  trip_status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  timezone?: string | null;
  /** 墙钟「今天」YYYY-MM-DD（按时区） */
  today_ymd?: string | null;
  destination?: string | null;
  location_summary_zh?: string | null;
  day_count?: number | null;
  member_count?: number | null;
  fitness_submitted_count?: number | null;
  fitness_pending_count?: number | null;
  vehicle_type?: string | null;
  open_risk_count?: number | null;
  open_decision_count?: number | null;
  unresolved_risks_zh?: string[];
  open_decisions_zh?: string[];
};

// ─── Actions ────────────────────────────────────────────────────────────────

export type ConversationActionV1 = {
  id: string;
  kind: ConversationActionKind;
  label_zh: string;
  label_en?: string;
  /** 与 kind 对应的负载；渠道原样回传或导航 */
  payload?: Record<string, unknown>;
};

// ─── Cards ──────────────────────────────────────────────────────────────────

export type TripFactCardV1 = {
  kind: 'trip_fact';
  title_zh: string;
  body_zh: string;
  /** 关联日 YYYY-MM-DD */
  focus_date_iso?: string;
  bullets_zh?: string[];
  /** 来源提示：day_view / consultation / readiness */
  source?: string;
};

export type ChangeDraftCardV1 = {
  kind: 'change_draft';
  title_zh: string;
  target_date_iso?: string;
  target_day_number?: number;
  draft_id?: string;
  before_summary_zh?: string[];
  after_summary_zh?: string[];
  schedule_change_bullets_zh?: string[];
  draft_schedule_zh?: string[];
  apply_gate?: {
    can_apply: boolean;
    apply_path?: string;
    deny_reason?: string;
    flawed_draft_forbidden?: boolean;
  };
  apply_snapshot?: Record<string, unknown>;
  durable_trip_run_id?: string | null;
  applied?: boolean;
};

export type DecisionOptionItemV1 = {
  id: string;
  title_zh: string;
  summary_zh?: string;
  recommended?: boolean;
  /** FEASIBLE | FEASIBLE_WITH_CHANGES | NEEDS_CONFIRMATION | BLOCKED */
  feasibility?: string;
  blocking_reasons_zh?: string[];
  required_changes_zh?: string[];
  /**
   * 仅当客户端不支持 select_decision_option 时，可把本字段填入下一轮 message。
   * 禁止把 id（如 2WD）填进输入框。
   */
  composer_message_zh?: string;
  dimensions?: {
    safety?: string;
    time?: string;
    budget?: string;
    energy?: string;
    experience?: string;
  };
};

export type DecisionOptionsCardV1 = {
  kind: 'decision_options';
  title_zh: string;
  problem_zh?: string;
  recommendation_zh?: string;
  options: DecisionOptionItemV1[];
  requires_consent?: boolean;
  negotiation_hash?: string;
  /** TravelDecisionProblem.decisionId */
  decision_id?: string;
  decision_key?: string;
  /** OPTIONS_READY | RECOMMENDED | SELECTED | COMMITTED … */
  decision_state?: string;
};

export type GateRiskCardV1 = {
  kind: 'gate_risk';
  title_zh: string;
  /** 结论优先 */
  conclusion_zh: string;
  rationale_zh?: string;
  severity?: 'info' | 'soft' | 'hard' | 'fatal';
  alternatives_zh?: string[];
  affected_date_iso?: string;
};

export type ImportPreviewCardV1 = {
  kind: 'import_preview';
  title_zh: string;
  status: 'stub' | 'parsed' | 'matched' | 'conflict' | 'ready_to_write';
  summary_zh: string;
  matched_day_iso?: string;
  conflicts_zh?: string[];
  missing_zh?: string[];
  guide_to_plan_session_id?: string;
  source_hint?: string;
};

export type TeamActionCardV1 = {
  kind: 'team_action';
  title_zh: string;
  body_zh: string;
  /** silent_vote | fitness_status | notify | summary */
  action_type: 'silent_vote' | 'fitness_status' | 'notify' | 'summary' | 'other';
  pending_member_names?: string[];
  submitted_member_names?: string[];
  notified_member_ids?: string[];
};

export type ApplyReceiptCardV1 = {
  kind: 'apply_receipt';
  title_zh: string;
  applied: boolean;
  summary_zh: string;
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
};

export type ConversationCardV1 =
  | TripFactCardV1
  | ChangeDraftCardV1
  | DecisionOptionsCardV1
  | GateRiskCardV1
  | ImportPreviewCardV1
  | TeamActionCardV1
  | ApplyReceiptCardV1;

export type ConversationDeliveryThinV1 = {
  verdict: DeliveryVerdict | string;
  user_confirm_required: boolean;
  flawed_present: boolean;
};

export type ConversationTurnResultV1 = {
  schema_id: typeof CONVERSATION_TURN_RESULT_SCHEMA_ID;
  version: 1;
  request_id: string;
  trip_id?: string;
  lifecycle: ConversationLifecycle;
  primary_card: ConversationCardKind;
  cards: ConversationCardV1[];
  actions: ConversationActionV1[];
  delivery: ConversationDeliveryThinV1;
  answer_text: string;
  /**
   * 住宿库存列表（非七类 kind）。MCP 有结果时写入；
   * 渠道须在信封内渲染，勿只依赖 payload 顶层双写字段。
   */
  accommodation_cards?: Array<Record<string, unknown>>;
  accommodations?: Array<Record<string, unknown>>;
  accommodation_night_groups?: Array<Record<string, unknown>>;
  hotel_search_meta?: Record<string, unknown>;
  /**
   * 租车推荐列表（非七类 kind）。Booking / Browserbase / 目录有结果时写入；
   * 渠道须在信封内渲染 `car_rental_cards`（与 Chat summary_json 同形）。
   */
  car_rental_cards?: Array<Record<string, unknown>>;
  car_rentals?: Array<Record<string, unknown>>;
  car_rental_search_meta?: Record<string, unknown>;
  car_rental_guidance_footnotes_zh?: string[];
  /**
   * 机票推荐列表（非七类 kind）。飞猪 / Amadeus 有结果时写入；
   * 渠道须在信封内渲染 `flight_cards`。
   */
  flight_cards?: Array<Record<string, unknown>>;
  flight_inventory_snapshot?: Record<string, unknown>;
  ui_surface?: string;
  /** Phase 2：上下文快照指针或内嵌摘要 */
  context?: TripConversationContextSnapshotV1;
  context_ref?: { trip_id: string; plan_version?: number | null };
  /**
   * CGUS Outcome Loop 回写指针（可选）。
   * 有此字段时可用 decision_id + trip_run_id_hint 打 Trip Review API；
   * 与 decision_options.decision_id（TravelDecisionProblem）可能不同，勿混用。
   */
  cgus_trip_review?: import('./../project-cgus-trip-review-ref.util').CgusTripReviewRefV1;
};

export function isConversationCardKind(v: unknown): v is ConversationCardKind {
  return (
    typeof v === 'string' &&
    (v === 'trip_fact' ||
      v === 'change_draft' ||
      v === 'decision_options' ||
      v === 'gate_risk' ||
      v === 'import_preview' ||
      v === 'team_action' ||
      v === 'apply_receipt')
  );
}
