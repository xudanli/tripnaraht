// src/trips/decision/world-model.ts

import type { WeatherExecutionSignal } from './execution/weather-execution-semantic-adapter';

/**
 * Trip World Model - 旅行规划的世界模型
 * 
 * 核心思想：把旅行规划抽象成 State（世界状态）+ Constraints（约束）+ Objective（目标函数）+ Actions（动作）
 */

export type ISODate = string;     // '2026-01-02'
export type ISOTime = string;     // '08:30'
export type ISODatetime = string; // '2026-01-02T08:30:00+00:00'

export type MoneyCurrency = 'USD' | 'EUR' | 'ISK' | 'JPY' | 'CNY' | string;

export type ActivityType =
  | 'sightseeing'
  | 'nature'
  | 'museum'
  | 'food'
  | 'shopping'
  | 'transport'
  | 'hotel'
  | 'tour'
  | 'rest'
  | 'other';

export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed';

export type TravelMode = 'walk' | 'drive' | 'transit' | 'rideshare' | 'bike' | 'unknown';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TimeWindow {
  start: ISOTime; // local
  end: ISOTime;   // local
}

export interface OpeningHours {
  // simplest: day-based windows. You can extend later to weekly rules.
  date: ISODate;
  windows: TimeWindow[];
  // optional flags: closedByWeather, seasonal, etc.
}

export interface CostEstimate {
  amount: number;
  currency: MoneyCurrency;
  // e.g., 'per_person', 'per_booking'
  unit?: string;
}

export interface TravelLeg {
  mode: TravelMode;
  from: GeoPoint;
  to: GeoPoint;
  durationMin: number;       // predicted
  distanceKm?: number;
  reliability?: number;      // 0~1 (optional)
  source?: string;           // 'google_routes' | 'osrm' | 'heuristic'
  /** L1 travel-time ontology — provenance + factors; align with durationMin when present */
  timeEstimate?: import('./travel-time-ontology/travel-time-ontology.types').TravelTimeEstimateV1;
}

export interface ActivityCandidate {
  id: string;                 // stable ID in your DB
  name: { zh?: string; en?: string; local?: string };
  type: ActivityType;

  location?: {
    point: GeoPoint;
    address?: string;
    region?: string;
  };

  // planning metadata
  indoorOutdoor?: IndoorOutdoor;
  durationMin: number;        // typical duration
  durationMaxMin?: number;    // optional

  openingHours?: OpeningHours[];   // for dates in trip horizon
  requiresBooking?: boolean;
  bookingDifficulty?: 1 | 2 | 3 | 4 | 5; // heuristic
  inventoryRisk?: 1 | 2 | 3 | 4 | 5;     // e.g., tours sell out
  /** L3 inventory reality — timed supply_risk / remaining_units; prefer over heuristic alone */
  supplySnapshot?: import('./inventory-ontology/inventory-reality.types').InventorySupplySnapshotV1;

  cost?: CostEstimate;
  riskLevel?: RiskLevel;      // e.g., glacier hike
  weatherSensitivity?: 0 | 1 | 2 | 3; // 0 not sensitive, 3 very sensitive

  // relevance signals
  intentTags?: string[];      // your intent taxonomy
  qualityScore?: number;      // 0~1
  uniquenessScore?: number;   // 0~1
  mustSee?: boolean;          // curated / user "must-do"

  // substitution grouping: only pick at most one in same group
  alternativeGroupId?: string; // e.g., "golden-circle-waterfall"
}

export interface UserPreferenceProfile {
  intents: Record<string, number>; // weight, e.g., { nature: 0.8, culture: 0.4 }
  pace: 'relaxed' | 'moderate' | 'intense';
  riskTolerance: RiskLevel;
  maxDailyActiveMinutes?: number; // energy budget proxy
  dislikeTags?: string[];
}

export interface TripContextState {
  /** Prisma `Trip.id` when known — HTTP/组装入口常用 `execution-closure-persistence/apply-prisma-trip-id-to-world-state` 写入，并与 `applyEcoLedgerTripContext` 对齐 `signals.ecoLedgerTripId`。 */
  tripId?: string;
  destination: string;
  startDate: ISODate;
  durationDays: number;

  budget?: { amount: number; currency: MoneyCurrency; style?: 'low' | 'medium' | 'high' };

  travelModeDefault?: TravelMode;  // drive / transit
  preferences: UserPreferenceProfile;

  anchors?: {
    // "hard constraints": flights/hotels you should never move
    hotelLocationsByDate?: Record<ISODate, GeoPoint>;
    fixedEvents?: Array<{ date: ISODate; start: ISOTime; end: ISOTime; title: string }>;
  };
}

export type { WeatherExecutionSignal };

export interface ExternalSignalsState {
  /**
   * 每日天气 / 执行语义（引擎经 WeatherDecisionEvidence 合并后为首选真相源）。
   */
  weatherByDate?: Partial<Record<ISODate, WeatherExecutionSignal>>;
  /** 天气管道时空传播摘要（与 TripPlan.temporal 同源，便于 Agent / 约束读取） */
  temporalPropagation?: import('./temporal/temporal-propagation.types').TemporalPropagationSignalSummary;
  /** 营运日窗（dayStart/dayEnd）相对槽位时刻的越界摘要（传播后） */
  operationalDayWindow?: import('./temporal/temporal-propagation.types').OperationalDayWindowSignalSummary;
  /** 民用晨光/暮光 vs 敏感活动槽位（需天气管道锚点坐标） */
  daylightFeasibility?: import('./temporal/temporal-propagation.types').DaylightFeasibilitySignalSummary;
  /**
   * Temporal Physics P0：驾驶/转移段抵达 vs 民用暮光（safe arrival；绑定 propagation + overnight 触发）。
   */
  legTemporalSafetyAssessments?: import('./temporal/leg-temporal-safety.types').LegTemporalSafetyAssessment[];
  /** P1：有效可驾驶窗（civil − weather − road） */
  effectiveDrivableWindowByDate?: Partial<
    Record<ISODate, import('./temporal/effective-drivable-window.types').EffectiveDrivableWindow>
  >;
  /** slot 级可执行窗（细粒度；非 day-level 摘要） */
  temporalExecutionWindowsBySlotId?: Partial<
    Record<string, import('./temporal/temporal-execution-window.types').TemporalExecutionWindow>
  >;
  /** 黄金时段机会域（utility / photography；勿混入 execution feasibility） */
  goldenHourOpportunityByDate?: Partial<
    Record<ISODate, import('./signals/golden-hour-opportunity.types').GoldenHourOpportunitySignal>
  >;
  /**
   * Overnight 重构压力场（Physics × Temporal 应力 × 营运窗）；不直接生成 repair。
   */
  overnightRestructuringPressures?: import('./restructuring/overnight-restructuring.types').OvernightRestructuringPressure[];
  /**
   * 按日极光因子（KP、云量、太阳风、概率等），由 IcelandAuroraAdapter 或外部推送写入。
   * 与 `nightObservationFeasibility` 搭配：后者由计划槽位 + 本字段汇总。
   */
  auroraByDate?: Partial<Record<ISODate, import('./signals/aurora-night-signals.types').AuroraNightObservationSignal>>;
  /**
   * 夜间户外极光观测可行性摘要（云厚 → 取消某城观测、换宿、改日等决策的输入）。
   */
  nightObservationFeasibility?: import('./signals/aurora-night-signals.types').NightObservationFeasibilitySignalSummary;
  /**
   * 夜间极光/观测机会域（utility field）：与可行性正交，用于 Abu 走廊候选、Dr.Dre 时间窗、Neptune 迁移。
   */
  auroraOpportunityByDate?: Partial<
    Record<ISODate, import('./signals/aurora-opportunity-signals.types').AuroraOpportunitySignal>
  >;
  /**
   * P2-A：机会走廊迁移评估（Utility vs Disruption）；Neptune 前置闸门，不直接改计划。
   */
  opportunityMigrationEvaluations?: import('./opportunity/opportunity-migration.types').OpportunityMigrationEvaluation[];
  /**
   * Neptune P2-B Step 1–2：结构化走廊迁移提案 + 后果模拟预览；不修改 TripPlan。
   */
  proposedCorridorMigrations?: import('./migration/proposed-corridor-migration.types').ProposedCorridorMigration[];
  /** Progressive micro-repair 建议（非全量 replan） */
  repairEvaluation?: import('./repair/repair-action.types').RepairEvaluationResult;
  /**
   * **Ingestion spec**（P8）：合并路由/天气/时间漂移后的逐 leg 输入，用于 **构建** `ExecutionTruthDAG`。
   * P-Next 3：`finalExecutionState` / reliability 由 PhysicsFieldIndex 物化后为 **执行痕迹**，不作为独立决策源。
   */
  executionOverlayFrames?: import('../execution-overlay/execution-overlay-frame.types').ExecutionOverlayFrame[];
  /**
   * **Canonical execution read-model**（P8）：节点 + 因果边；Neptune / Repair（canonical 模式）仅允许依赖此结构。
   */
  executionTruthDAG?: import('../execution-truth-dag/execution-truth-dag.types').ExecutionTruthDAG;
  /**
   * P8-2-B：仅由 `compileDAGToIR` 写入（`meta.source === DAG_COMPILER`）；Neptune / Repair 只读，禁止运行时拼装 IR。
   */
  executionIR?: import('../execution-ir/execution-ir.types').ExecutionIR;
  /**
   * P14：上一决策 tick（或外部锚定）的结构指纹 —— 用于 Execution Stability Control Plane 漂移检测。
   */
  executionStabilityBaseline?: import('../execution-stability/stability.types').ExecutionStabilityBaseline;
  /**
   * **Snapshot / audit artifact**（P8）：解释层与健康度叙事；**禁止**作为 repair / Neptune / 可行性闸门输入。
   * 调试、追溯、Agent 展示可用。
   */
  executionSemanticView?: import('./execution/unified-execution-semantic-view').UnifiedExecutionSemanticView;
  /**
   * P-FUEL-1：沿自驾走廊的续航 vs 下一补给点 — 写入 overlay 前由引擎计算；与 weather/road/daylight 并列物理域。
   */
  fuelReachabilityByLegId?: Partial<
    Record<string, import('../fuel/fuel-reachability.types').FuelReachabilitySummary>
  >;
  /**
   * P-Next 1.1 / P-Next 3：由 overlay **域字段**编译的物理状态向量；决策权威在索引层，overlay 上的 outcome 字段为 physics 投影后的观测痕迹。
   */
  unifiedPhysicsFieldByLegId?: Partial<
    Record<string, import('../physics/unified-physics-field.types').UnifiedPhysicsField>
  >;
  /**
   * P-Next 1.1：物理场决策索引（leg / date / derived 桶）；与 `unifiedPhysicsFieldByLegId` 同源构建。
   */
  physicsFieldIndex?: import('../physics/unified-physics-field-index.types').PhysicsFieldIndex;
  /**
   * P-Next ECO：最近一次认知编排摘要（审计）；由 `commitEcoWorldModelUpdate` 写入。
   */
  ecoOrchestrationDigest?: import('../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types').EcoOrchestrationDigest;
  /**
   * P-ECO-Closure-10 product layer：跨 `repairPlan` 调用持久化的身份账本（同一 TripWorldState 进程内），用于连续性证明与策略门控。
   */
  ecoIdentityLedger?: import('../execution-closure-persistence/eco-identity-ledger.types').EcoIdentityLedgerSnapshot;
  /**
   * 当设置且存在持久化服务时，`repairPlan` 等会从 `Trip.metadata.ecoIdentityLedgerV1` 预加载账本并写回。
   * 典型由 `applyPrismaTripIdToWorldState` / `applyEcoLedgerTripContext` 从 Prisma id 或策略字段解析。
   */
  ecoLedgerTripId?: string;
  /**
   * `Trip.metadata.ecoIdentityLedgerRevision`：hydrate 时读入、persist 成功后递增；用于账本 CAS，缓解多实例 last-write-wins。
   */
  ecoLedgerMetadataRevision?: number;
  /**
   * P-Evolution-1：上一次成功提交的 guarded snapshot（因果哈希 + overlay/DAG 尺度），用于下一 tick 的 mutation distance。
   */
  ecoIdentityGuardSnapshot?: import('../execution-closure-persistence/eco-identity-guard.types').EcoIdentityGuardSnapshot;
  /** P-Evolution-1：最近一次 identity guard 评估（审计 / 观测漂移）。 */
  ecoIdentityDriftEvent?: import('../execution-closure-persistence/eco-identity-guard.types').EcoIdentityDriftEvent;
  /** P-Evolution-2 — append-only rejected transitions (identity graph failure edges). */
  identityRejectionEdges?: import('../execution-closure-persistence/eco-identity-lineage.types').IdentityRejectionEdge[];
  /** P-E4 — last identity path reconciliation decision (audit). */
  identityReconciliationDecision?: import('../execution-closure-persistence/eco-reconciliation.types').ReconciliationDecision;
  /** P-CI-4 — self-regulation snapshot (pressure-derived control knobs; replay / audit). */
  pressureRegulation?: import('../execution-closure-persistence/pressure-regulation.types').PressureRegulationSnapshot;
  /** P-CI-4 skeleton — optional control vector from readiness artifact / {@link import('../execution-closure-persistence/p-ci-4').computeControlSignal}. */
  controlSignal?: import('../execution-closure-persistence/p-ci-4').Pci4ControlSignal;
  /** P-CI-5 — runtime control energy field snapshot (audit). */
  controlEnergyState?: import('../execution-closure-persistence/p-ci-5').ControlEnergyState;
  /** P-CI-5 — discrete regime label derived from energy + gradient. */
  controlRegime?: import('../execution-closure-persistence/p-ci-5').ControlRegime;
  /** P-CI-6 — phase-transition field snapshot (audit). */
  controlPhaseState?: import('../execution-closure-persistence/p-ci-6').ControlPhaseState;
  /** P-CI-6 — true when discrete phase label changed vs previous tick (event marker). */
  controlPhaseTransition?: boolean;
  /**
   * P-Next ECO：上一 tick 写回的反射因果模型（下一决策修订种子）。
   */
  reflectiveCausalModel?: import('../causal-reflection/causal-model.types').CausalModel;
  /**
   * P-OPS-3：营运策略治理评估快照（warn / degrade / block / reroute；版本化策略产物）。
   */
  opsOperationalGovernance?: import('./operational-policy/operational-policy.types').OpsOperationalGovernanceSnapshot;
  /** Reality Policy Engine — execution contract for this tick (ALLOW / DEGRADE / BLOCK semantics). */
  realityExecutionContract?: import('../reality-kernel/reality-policy-engine.types').RealityExecutionContractSnapshotV0;
  /** Execution Gate — mirrors ALS {@link DecisionContextV0.execution_runtime_mode} after planning/repair policy bind. */
  realityExecutionMode?: 'NORMAL' | 'DEGRADED';
  /** Mirrors {@link DecisionContextV0.execution_degrade_strategy}. */
  realityDegradeStrategy?: import('../reality-kernel/execution-gate.types').DegradeStrategy;
  /** P1：因果追溯 — policy、bypass、staleness（append-only）。 */
  realityExecutionTrace?: import('../reality-kernel/reality-policy-engine.types').RealityExecutionTraceEventV0[];
  /**
   * Policy → Plan → Execution 因果骨架（append-only；每元素一次 generate_plan / repair_plan tick）。
   */
  decisionCausalityChain?: import('../reality-kernel/decision-causality.types').DecisionCausalityRecordV0[];
  /** 当前 tick 草稿 — gate 通过后写入，返回计划前冲刷入 `decisionCausalityChain` */
  _decisionCausalityDraft?: import('../reality-kernel/decision-causality.types').DecisionCausalityDraftPayload;
  /** 最近一次写入因果链的 `causality_id`（供 outcome / telemetry 关联） */
  lastDecisionCausalityId?: string;
  alerts?: Array<{ code: string; severity: 'info'|'warn'|'critical'; message: string }>;
  lastUpdatedAt: ISODatetime;
}

export interface TripWorldState {
  context: TripContextState;

  // candidate pool for planning
  candidatesByDate: Record<ISODate, ActivityCandidate[]>;

  // travel time provider result cache (optional)
  travelMatrix?: Record<string, number>; // key `${fromId}->${toId}` minutes

  signals: ExternalSignalsState;

  // policies: per product requirements
  policies?: {
    dayStart?: ISOTime; // e.g. '08:00'
    dayEnd?: ISOTime;   // e.g. '21:00'
    bufferMinBetweenActivities?: number; // e.g. 10
    maxBudgetOverrunRatio?: number;      // e.g. 1.05
    /** 自驾/租车车型 → 天气 hazard 与执行质量（P2） */
    vehicleProfile?: import('./hazard/travel-hazard.types').VehicleProfile;
    /** P-FUEL-1：续航包络 — 缺省由引擎使用保守 ICE 假设 */
    vehicleFuelProfile?: import('../fuel/fuel-reachability.types').VehicleFuelProfile;
    /** 兼容：仅传车型枚举字符串时由决策引擎归一化 */
    vehicleClass?: import('./hazard/travel-hazard.types').VehicleClass;
    /**
     * 民用晨光/暮光换算到墙上时钟：UTC + 该偏移（分钟，东为正）。
     * 冰岛常用 0；中欧冬季可设 60。
     */
    daylightUtcOffsetMinutes?: number;
    /**
     * P5-CLOSE：为 true 时与 `TRIP_EXECUTION_OVERLAY_LOCK=1` 相同 —— 含驾驶腿的行程必须有 overlay 帧才可继续决策融合。
     */
    executionOverlayDecisionLock?: boolean;
    /**
     * P8-1：为 true 时与 `TRIP_DAG_CANONICAL_LOCK=1` 相同 —— 决策链必须有非空 `executionTruthDAG`；
     * overlay 帧仅作 DAG builder 输入，SemanticView 不得承担决策输入职责。
     */
    dagCanonicalDecisionLock?: boolean;
    /**
     * P8-2-A：与 `TRIP_IR_ONLY_LOCK=1` 相同 —— 决策路径不得声明依赖 overlay / SemanticView（由调用方 audit 传入 `assertNoDecisionOutsideIR`）。
     */
    irOnlyDecisionLock?: boolean;
    /**
     * P8-2-B：与 `TRIP_REPAIR_IR_ONLY_LOCK=1` 相同 —— Repair / Neptune 修复链仅消费 `executionIR` + DAG witness。
     */
    repairIROnlyLock?: boolean;
    /**
     * P-Next 3：为 true 且存在 `physicsFieldIndex` 时，RepairEvaluator 不把 overlay 帧当作因果修复入口
     *（日照/延误/跨日回到 daylight / drift 等非 overlay 启发式；fuel 等仍走物理可达性）。
     */
    overlayExplanationOnly?: boolean;
    /**
     * P-Next 3 迁移闸：禁止与 physics-first 路由同时声明「overlay 参与决策」。
     */
    executionOverlayFramesUsedForDecision?: boolean;
    /**
     * P-Next 4：DAG / IR / VM 仅为编译与观测；Neptune 与 Repair 不将 DAG/IR 路径当作决策输入。
     * 启用：`TRIP_DAG_OBSERVER_ONLY=1` 或设为 true。
     */
    dagObserverOnly?: boolean;
    /** P-Next 4 迁移闸：禁止同时声明 DAG 驱动决策。 */
    dagUsedForDecision?: boolean;
    /**
     * P-Next 5：`Neptune.neptuneRepairPlan` 产出 `executionProof` + `invariantCheckResult`。
     * 亦可设 `TRIP_EXECUTION_PROOF=1`。
     */
    emitExecutionProof?: boolean;
    /**
     * P-Next 6：与 `emitExecutionProof` 联用时把 DSL 语义评估写入 proof（`evaluations` / `violations` / `semanticAggregateDistance`）。
     * 亦可设 `TRIP_EXECUTION_SEMANTICS=1`。
     */
    semanticProofLayer?: boolean;
    /**
     * P-Next ECO：`repairPlan` 在 Neptune 之后串联 P7–P10（语义共识 → 反事实审计 → 因果干预 → 反射模型）。
     * 亦可设 `TRIP_ECO_PIPELINE=1`。`mode: legacy` 或不启用时不跑认知阶段。
     */
    ecoPipeline?: import('../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types').EcoPipelinePolicy;
    /**
     * ECO–Neptune closure：不稳定时可选第二次 `neptuneRepairPlan`（须 `allowNeptuneRetry` 或 `TRIP_ECO_CLOSURE_NEPTUNE_RETRY=1`）。
     * `correctionStrategy`: `minimal_patch_then_neptune`（见 `execution-convergence-optimizer`）或 legacy `full_neptune_retry`。
     * `convergenceSemantics`: P-ECO-Closure-3 固定点 ε（见 `execution-convergence-formalization`）。
     * `useFixedPointIterationGate` / `TRIP_ECO_FP_GATE`：用不动点语义决定是否二次 Neptune。
     */
    ecoClosure?: import('../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types').EcoClosurePolicy;
    /**
     * Progressive micro-repair 数值边界（RepairEvaluator 读取）
     */
    microRepair?: {
      maxCompressMinutes?: number;
      /** 跨日 spill 缓解：前移前一日末段的上限（分钟） */
      crossDayMitigationCapMinutes?: number;
      daylightShiftHintMinutes?: number;
      sequencePressureThresholdMinutes?: number;
      /**
       * 酒店入住参考：抵达槽（type=hotel）开始时间若晚于此，触发 Booking 域修复建议。
       * 不设则不启用（避免无酒店行程噪声）。
       */
      hotelCheckinLatest?: ISOTime;
    };
  };
}

