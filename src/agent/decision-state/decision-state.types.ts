/**
 * Decision State Contract — Minimal Decision State (MDS) 核心类型。
 *
 * 权威语义：Decision Class × Action Mode 声明最小充分状态。
 * Phase 1：Shadow only — 不改变 CRE / ROR / InteractionPolicy 出站动作。
 *
 * State 是 Canonical World State 的只读投影，不是第二套事实库。
 */

export type DecisionDomain =
  | 'ACTIVITY'
  | 'LODGING'
  | 'TRANSPORT'
  | 'ROUTE'
  | 'DINING'
  | 'RISK'
  | 'PLAN';

/** Activity 决策类 × 动作（首批冻结） */
export type ActivityDecisionClass =
  | 'ACTIVITY.BOOKING_GUIDANCE'
  | 'ACTIVITY.AVAILABILITY_CHECK'
  | 'ACTIVITY.SUITABILITY_DECISION'
  | 'ACTIVITY.RESERVATION_PREP'
  | 'ACTIVITY.RESERVE';

/** Lodging 决策类 × 动作（第二域） */
export type LodgingDecisionClass =
  | 'LODGING.GAP_QUERY'
  | 'LODGING.NIGHT_CHOICE'
  | 'LODGING.INVENTORY_SEARCH';

/** Transport / Route（第三域） */
export type TransportDecisionClass =
  | 'TRANSPORT.RENTAL_GUIDANCE'
  | 'TRANSPORT.VEHICLE_FIT';

export type RouteDecisionClass = 'ROUTE.DAY_ORDER_OPTIMIZE';

/** Dining / Risk（第四批） */
export type DiningDecisionClass =
  | 'DINING.RECOMMENDATION'
  | 'DINING.NEAR_POI';

export type RiskDecisionClass =
  | 'RISK.WEATHER_IMPACT'
  | 'RISK.PACE_ASSESS';

export type PlanDecisionClass = 'PLAN.DAY_REPLAN';

export type DecisionClass =
  | ActivityDecisionClass
  | LodgingDecisionClass
  | TransportDecisionClass
  | RouteDecisionClass
  | DiningDecisionClass
  | RiskDecisionClass
  | PlanDecisionClass
  | `${DecisionDomain}.${string}`;

export type StateKey =
  | 'day_anchor'
  | 'activity_ref'
  | 'team_fitness_floor'
  | 'booking_channel'
  | 'day_conflict'
  | 'party_size'
  | 'booking_policy'
  | 'activity_requirements'
  | 'selected_slot'
  | 'live_availability'
  | 'member_eligibility'
  | 'contact_info'
  | 'payment_authorization'
  | 'trip_binding'
  | 'trip_day_span'
  | 'lodging_coverage'
  | 'lodging_assignment'
  | 'vehicle_profile'
  | 'road_access'
  | 'rental_policy'
  | 'route_scope'
  | 'dining_anchor'
  | 'restaurant_channel'
  | 'weather_evidence'
  | 'day_activity_seed';

export type KeyNecessity = 'REQUIRED' | 'CONDITIONAL' | 'OPTIONAL';

export type KeyPresence =
  | 'PRESENT'
  | 'PARTIAL'
  | 'MISSING'
  | 'UNKNOWN'
  | 'IGNORED';

export type AcquisitionStrategy =
  | 'DERIVE_FROM_MESSAGE'
  | 'DERIVE_FROM_TRIP_DAY'
  | 'AGGREGATE_MEMBERS'
  | 'LIVE_THEN_CATALOG'
  | 'CATALOG_ONLY'
  | 'USER_PROMPT'
  | 'PROVIDER_LIVE'
  | 'LOAD_TRIP_LODGING_SLICE';

export type MissingPolicy =
  | 'ASK_USER'
  | 'NEED_CONFIRM'
  | 'ALLOW_WITH_UNKNOWN'
  | 'CATALOG_FALLBACK'
  | 'DEGRADE'
  | 'BLOCK'
  | 'WARN'
  | 'IGNORE';

export type GapPriority = 'P0_SEMANTIC_ANCHOR' | 'P1_HARD_SAFETY' | 'P2_USER_REQUIRED' | 'P3_EXTERNAL' | 'P4_OPTIONAL';

export type BookingChannelMode = 'LIVE' | 'CATALOG' | 'UNAVAILABLE' | 'UNKNOWN';

export type DayConflictStatus = 'NONE' | 'SOFT' | 'HARD' | 'UNKNOWN';

export type DecisionReadiness =
  | 'READY'
  | 'READY_WITH_WARNING'
  | 'NEED_USER_INPUT'
  | 'DEGRADED'
  | 'BLOCKED'
  | 'EXTERNAL_UNAVAILABLE';

export type DecisionNextAction =
  | 'ANSWER'
  | 'SHOW_CARD'
  | 'ASK_USER'
  | 'FETCH'
  | 'CATALOG_FALLBACK'
  | 'WARN'
  | 'BLOCK';

export type ContractKeyDeclaration = {
  key: StateKey;
  necessity: KeyNecessity;
  /** when 表达式提示，如 activity.high_intensity */
  when?: string;
  source: string;
  acquisition: AcquisitionStrategy;
  missingPolicy: MissingPolicy;
  priority: GapPriority;
  labelZh: string;
};

export type DecisionStateContract = {
  decisionClass: DecisionClass;
  version: string;
  labelZh: string;
  keys: ContractKeyDeclaration[];
  /**
   * 明确忽略的世界态键（Invariant：不得因这些缺失阻断）
   */
  ignoredWorldKeys: string[];
};

export type ProjectedKeyState = {
  key: StateKey;
  presence: KeyPresence;
  value?: unknown;
  noteZh?: string;
};

export type DecisionStateProjection = {
  decisionClass: DecisionClass;
  contractVersion: string;
  keys: ProjectedKeyState[];
  /** Contract 未声明、投影侧记录为 ignored 的世界态 */
  ignored: Array<{ key: string; presence: KeyPresence; noteZh?: string }>;
};

export type DecisionReadinessResult = {
  decisionClass: DecisionClass;
  contractVersion: string;
  readiness: DecisionReadiness;
  missingKeys: StateKey[];
  uncertainKeys: StateKey[];
  blockingKeys: StateKey[];
  nextAction: DecisionNextAction;
  reasonCode: string;
  askUserKeys: StateKey[];
  warningsZh: string[];
};

/** Shadow / Takeover 观测切片 */
export type DecisionStateShadowV1 = {
  schema: 'tripnara.decision_state_contract_shadow@v1';
  mode: 'SHADOW_OBSERVE_ONLY' | 'TAKEOVER_ELIGIBLE';
  classified: {
    decisionClass: DecisionClass | null;
    confidence: number;
    reason: string;
  };
  contract: DecisionStateContract | null;
  projection: DecisionStateProjection | null;
  readiness: DecisionReadinessResult | null;
  /** 与现链 CRE/ROR 动作的对照（不改现网） */
  legacyCompare: {
    creOperation?: string;
    creNextAction?: string;
    legacyWouldAskUser: boolean;
    shadowNextAction: DecisionNextAction | null;
    divergenceCodes: string[];
  };
  invariants: Array<{ id: string; ok: boolean; detail?: string }>;
};
