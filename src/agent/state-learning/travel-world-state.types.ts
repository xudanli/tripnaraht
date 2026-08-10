/**
 * TravelWorldState — State & Learning Foundation P0。
 * 统一 Trip / Plan / Decision / Execution / Risk / Member / Booking 的**当前状态投影**。
 *
 * 非 SoT：Prisma Trip + metadata + StateStore 仍是事实源；本结构只读聚合。
 * 控制层冻结：不新增 Runtime / 路由 / Guard。
 */

export const TRAVEL_WORLD_STATE_SCHEMA = 'nara.travel_world_state@v1' as const;

/** 投影权威：永远不是 Truth / Authority */
export type TravelWorldStateAuthority = 'PROJECTION_ONLY';

export type TravelWorldTripSlice = {
  tripId: string;
  name?: string | null;
  status?: string | null;
  destination?: string | null;
  startDate?: string | null;
  endDate?: string | null;
  lifecycle?: 'PLANNING' | 'TRAVELING' | 'COMPLETED' | 'UNKNOWN';
};

export type TravelWorldPlanSlice = {
  planVersion?: number | null;
  tripVersion?: number | null;
  dayCount?: number | null;
  /** 摘要级日程；非全量 dump */
  daySummariesZh: string[];
};

export type TravelWorldDecisionRef = {
  decisionId: string;
  decisionKey?: string;
  state: 'OPEN' | 'COMMITTED' | 'CANCELLED' | 'UNKNOWN';
  subjectZh?: string;
};

export type TravelWorldDecisionSlice = {
  open: TravelWorldDecisionRef[];
  latestCommitted?: TravelWorldDecisionRef | null;
};

export type TravelWorldExecutionSlice = {
  phase?: string | null;
  liveVerdict?: 'YES' | 'NO' | 'CONDITIONAL' | null;
  liveConclusionZh?: string | null;
  deadlineZh?: string | null;
  appliedToItinerary: boolean;
};

export type TravelWorldRiskSlice = {
  eventIds: string[];
  highestUrgency?: number | null;
  summaryZh?: string | null;
  gateOk?: boolean | null;
};

export type TravelWorldMemberSlice = {
  partyTotal?: number | null;
  hasChildren?: boolean | null;
  hasElderly?: boolean | null;
  fitnessLevel?: string | null;
  riskTolerance?: string | null;
  memberIds: string[];
};

export type TravelWorldBookingItem = {
  dayIndex?: number | null;
  placeName?: string | null;
  bookingStatus?: string | null;
};

export type TravelWorldBookingSlice = {
  items: TravelWorldBookingItem[];
  missingLodgingDays: number[];
};

/** 与 Ledger / Trace / Receipt 关联的锚点（非事件本体） */
export type TravelWorldCorrelationSlice = {
  latestTurnId?: string | null;
  latestTaskId?: string | null;
  latestDecisionId?: string | null;
  latestActionId?: string | null;
  latestPlanVersion?: number | null;
  latestAgentTurnTraceSchema?: string | null;
};

export type TravelWorldStateV1 = {
  schemaId: typeof TRAVEL_WORLD_STATE_SCHEMA;
  version: 1;
  projectedAt: string;
  authority: TravelWorldStateAuthority;
  trip: TravelWorldTripSlice;
  plan: TravelWorldPlanSlice;
  decisions: TravelWorldDecisionSlice;
  execution: TravelWorldExecutionSlice;
  risk: TravelWorldRiskSlice;
  members: TravelWorldMemberSlice;
  booking: TravelWorldBookingSlice;
  correlation: TravelWorldCorrelationSlice;
  /** 投影所用输入标记（便于审计；不含 latent） */
  sources: {
    decisionOs?: boolean;
    tripMetadata?: boolean;
    liveConclusion?: boolean;
    riskEvents?: boolean;
    partyProfile?: boolean;
    lodgingFacts?: boolean;
  };
};
