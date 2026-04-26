/**
 * Decision State Object (DSO)
 *
 * 统一决策状态结构 - 所有 Agent 共享
 * Phase 2.1: Decision Kernel 中心化架构
 *
 * 参考: docs/DECISION_KERNEL_UPGRADE_ROADMAP.md
 * 映射: OrchestratorState / LangGraphState → DecisionState
 */

import type { ContextPackage } from '../../agent/context-engine/types/context-package.types';
import type { WorldStateSummary } from './world-state-summary.types';
import type { HarnessStepName } from '../../harness/contracts/harness-step.types';
import type { RepairTrace } from '../../agent/services/route-feasibility.types';

/** 用户意图（从 INTAKE 提取） */
export interface UserIntent {
  destination?: string | { lat: number; lng: number };
  origin?: string | { lat: number; lng: number };
  dateRange?: { startDate: string; endDate: string };
  days?: number;
  mode?: 'walk' | 'drive' | 'transit' | 'mixed';
  party?: { count: number; fitnessLevel?: string; riskTolerance?: string };
  constraints?: Record<string, unknown>;
  preferences?: Record<string, unknown>;
  /** 策略模式（从查询提取） */
  strategyMode?: string;
  /** 缺口列表 */
  gaps?: Array<{ type: string; severity: 'HARD' | 'SOFT'; detail: string }>;
  /** 预算金额 */
  budget?: number;
  /** 灵活度 (0-1) */
  flexibility?: number;
  /** 体能水平 (0-1) */
  fitnessLevel?: number;
  /** 风险承受度 (0-1) */
  riskTolerance?: number;

  // --- Phase 1 POI：区域意图与路线约束（见 docs/POI_REGION_INTENT_PHASE1.md） ---
  /** 区域线路 ID（如 golden_circle），与 planning-policy RegionIntent 对齐 */
  regionId?: string;
  /** 用户指定必含 POI（可抬升为与锚点同级必选） */
  mustIncludePoiIds?: string[];
  excludePoiIds?: string[];
  availableStartTime?: string;
  availableEndTime?: string;
  /** 当日可用总时长（分钟） */
  totalBudgetMinutes?: number;
  /** 节奏（影响日程 buffer 比例） */
  pace?: 'relaxed' | 'normal' | 'dense';
  styleTags?: string[];
}

/** 行程状态 */
export interface TripState {
  location?: string;
  day?: number;
  fatigue?: number;
  delayMinutes?: number;
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  /** 计划草案 */
  planDraft?: unknown;
  /** 当前行程版本 */
  planVersion?: number;
  /** 预算超支比例 (0-1)，用于 dimensionBreakdown.budget */
  budgetOverrun?: number;
  /** 完成进度 (0-1)（用于 differentiable-decision） */
  completionRate?: number;
  /** 质量评分 (0-1)（用于 differentiable-decision） */
  qualityScore?: number;
  /**
   * Gate BLOCK 时与 Agent `OrchestratorState.alternatives` 对齐的替代项（replan / 持久化出口，供 TD-03 校验）
   */
  orchestratorAlternatives?: {
    alternative_pois: unknown[];
    alternative_routes: unknown[];
  };
}

/** 航班信息（实施例 2 动态重规划） */
export interface EnvironmentFlight {
  flight?: string;
  status?: 'scheduled' | 'delayed' | 'cancelled' | string;
  price?: number;
}

/** 路线走廊注入 DSO 的可计算世界切片（RouteDirection → 空间约束摘要） */
export type RouteRegionType = 'nature' | 'city' | 'mixed';

export interface RouteCorridorWorldModel {
  routeDirectionId: string;
  regionLabel?: string;
  regionLabels?: string[];
  /** ST_AsText(corridorGeom)；无走廊几何时为 undefined */
  corridorWkt?: string | null;
  constraints?: {
    maxDailyDriveHours?: number;
    terrain?: string;
    [key: string]: unknown;
  };
  poiHints?: string[];
  regionType?: RouteRegionType;
}

/** 环境状态（世界模型输出） */
export interface EnvironmentState {
  countryCode?: string;
  month?: number;
  roadConditions?: Record<string, unknown>;
  weatherRisk?: number;
  /** 观测/预测的平均风速（m/s），供 POMDP 信念更新与审计使用 */
  windSpeedMs?: number;
  routeDirectionId?: string;
  /** RouteDirection 解析后的走廊/区域语义，供检索、fallback、世界摘要共用 */
  routeCorridorWorld?: RouteCorridorWorldModel;
  /** 失败风险评估（FailureRiskPredictionService 输出） */
  failureRiskLevel?: 'LOW' | 'MEDIUM' | 'HIGH';
  /** 拥挤程度 (0-1)，用于避流维度 */
  crowdLevel?: number;
  /** 季节评分 (0-1)（用于 differentiable-decision） */
  seasonScore?: number;
  /** 可达性评分 (0-1)（用于 differentiable-decision） */
  accessibilityScore?: number;
  /** 价格水平 (0-1)（用于 differentiable-decision） */
  priceLevel?: number;
  /** 航班信息（实施例 2：航班取消时触发 REPLAN） */
  flights?: EnvironmentFlight[];
  /**
   * 按行程 `day.date`（YYYY-MM-DD）索引的日出/日落（ISO 8601 字符串，建议 UTC）。
   * 由 RESEARCH / 气象或天文 skill 写入，供 `solveDayTimeline` 对户外自然景观做可视窗口裁剪。
   */
  daylightByDate?: Record<string, { sunrise?: string; sunset?: string; civil_dusk?: string }>;
  /** 扩展字段（测试/世界模型推送用，如 _weatherUpdateAt、_simulatedBy） */
  [key: string]: unknown;
}

/** PLAN_GEN 空草案或无法进入生成器时的终止信号（写入 DSO.systemState） */
export interface PlanGenTerminalFailure {
  code: string;
  message: string;
  detail?: string;
}

/** 系统状态 */
export interface SystemState {
  requestId: string;
  currentPhase?: string;
  /**
   * 上一原子提交（commit）关联的阶段名，与 `StateUpdateTransaction.stageOutput` / 内核阶段字符串对齐。
   * v1.0：表示「本阶段已成功落盘」的事实；`merge()` 不会自动写入，仅在 `commit()` / `applyPhaseResult()` 成功时推进。
   * 下一准入步须由编排/恢复逻辑 **显式** 计算（例如 `calculateNextLogicalStep`），勿把本字段当作「待执行」指针。
   */
  lastStep?: string;
  /**
   * v1.0：与 `HarnessStepName` 对齐的 **已完成** 硬阶段里程碑（与 `executePhase` 本次提交对应的 Harness 步一致）。
   * 语义刻意为「已达成的成就」而非「下一待准入步」：异步/崩溃恢复时避免与「跑了一半」混淆；`lastStep`（string）与本枚举双锚点，供恢复与契约校验推导下一 `validateStepAdmission` 目标。
   * 断点续跑时优先于 `OrchestratorState.current_step`（后者可含 UI 中间态）。
   */
  cursorStep?: HarnessStepName;
  startedAt?: string;
  lastUpdatedAt?: string;
  /** 专利要求：版本号，用于冲突解决与回滚（DECISION_OS_PATENT_GAP_IMPLEMENTATION_PLAN） */
  version?: number;
  /** 系统置信度 (0-1) */
  confidence?: number;
  /** 迭代计数（用于 differentiable-decision） */
  iterationCount?: number;

  /**
   * VERIFY↔REPAIR 自动修复计数器（收敛保护）
   * - 每进入一次 Kernel.executeRepair 且 **RepairExecutor 已实际执行**（未在 harness/BLOCK 等路径提前返回）后递增一次
   * - 计入范围包含：**仅产生 `verification.escalationPlan`、未改写 planDraft`** 的高成本策略博弈（L1→L2→二阶仍物理不可行），防止 VERIFY↔REPAIR 死循环
   * - 超过阈值后建议由编排层转为 NEED_CONFIRMATION（HITL）
   */
  repairCount?: number;

  /**
   * Decision Transaction（事务性保护）：
   * 当进入 VERIFY→REPAIR 临界区时加锁，防止“半执行态”被持久化/继续执行。
   * - locked=true 表示临界区内；allowedStages 仅允许 VERIFY/REPAIR 提交
   * - baseVersion 用于异常时回滚到锁定前的稳定版本（由上层决定如何取回快照）
   */
  stageLock?: {
    locked: boolean;
    owner: 'VERIFY_REPAIR';
    lockedAt: string;
    baseVersion: number;
    allowedStages: Array<'VERIFY' | 'REPAIR'>;
  };

  /**
   * 自动修复的“效用衰减”收敛保护（最小实现）
   * - lastExpectedUtility: 上一次 OPTIMIZE 的 E[U]（若存在）
   * - consecutiveUtilityDeclines: 连续下降计数；达到阈值后应停止自动修复
   */
  lastExpectedUtility?: number;
  consecutiveUtilityDeclines?: number;

  /**
   * Strongly-typed repair traces (proof observability for RL / audit).
   * v1: last repair round only (bounded payload).
   */
  repairTraces?: RepairTrace[];

  /**
   * Session-scoped append-only log of repair traces (same request / DSO lifetime).
   * Used by INTAKE UserDynamicBoundary and utility-budget aggregation.
   */
  repairTraceHistory?: RepairTrace[];

  /**
   * 跨天迁移请求队列（VERIFY/REPAIR 发现单日无法收敛时由 Repair 写入，编排层消费）
   * @see PendingMigrationRequest
   */
  pendingMigrations?: PendingMigrationRequest[];

  /**
   * 绝境下的可恢复失败：自动修复已尽力但物理/环境仍不可行，需用户确认或改期而非无限重试
   * （例如全境封路导致各段 ETA 极端偏长）
   */
  recoverySignal?: 'FAILED_RECOVERABLE' | 'NEED_USER_INTERVENTION';

  /**
   * PLAN_GEN 后 `planDraft` 无任何日程天，或生成前即失败（执行器缺失、Harness 拦截等）。
   * 编排层应短路 VERIFY/OPTIMIZE/REPAIR/NARRATE，避免在空草案上「编建议」。
   */
  planGenTerminalFailure?: PlanGenTerminalFailure;

  /** PLAN_GEN 空草案后的用户回合次数（用于防死循环与审计） */
  planGenRetryCount?: number;
  /** 对 clarification_answers 做稳定序列化后的 hash，用于识别无效重复尝试 */
  lastRelaxationFingerprint?: string;
  /** 连续提交相同 fingerprint 的次数 */
  consecutiveSameRelaxationAttempts?: number;
  /** 用户批准的终止意图：在不放宽约束前提下确认无解 */
  terminalIntent?: 'TERMINAL_NO_SOLUTION';

  /**
   * 用户在 EARLY_WARNING 拦截回合选择「自担风险继续」：不 Patch TripPlanRequest，但放行后续 POI/PLAN_GEN（撞南墙模式，供审计与 Narrator 训练）。
   */
  earlyWarningAcknowledged?: boolean;

  /**
   * 迁移注入后仍连续 REPAIR 升级（无法被相邻日吸收）的计数；≥2 时可置 NEED_USER_INTERVENTION
   */
  migrationAbsorptionFailures?: number;

  /**
   * 用户针对带 `correlationId` 的 REPAIR/效用补偿澄清之选择（append-only，供离线 RLHF join）。
   */
  userRepairResolutionLog?: UserRepairResolutionEvent[];
}

/** 跨天迁移协议（Bubble-up）：锚点或关键节点无法在当日时间/日照约束下落位时建议挪至相邻日 */
export interface PendingMigrationRequest {
  id: string;
  kind: 'MIGRATION_REQUEST';
  fromDayDate: string;
  toDayDate: string;
  /** 与 itinerary item / place_id 对齐的节点引用 */
  nodeId: string;
  reason: 'SUNSET_ANCHOR_NOT_ASSIGNABLE_ON_DAY';
  createdAt: string;
}

/** 约束违规项（专利：g_i(s,a) 违反程度，g_i ≤ 0 表示满足） */
export interface ConstraintViolationItem {
  type: string;
  severity: 'HARD' | 'SOFT';
  detail: string;
  /** 约束名称/标识（用于 explainability 模块） */
  constraint?: string;
  /**
   * Phase 2 研究级：违反程度 (0-1)，对应 g_i(s,a) > 0 时的量化值
   * 0 表示无违反，1 表示完全违反。用于约束优化形式 g_i(s,a) ≤ 0
   */
  degree?: number;
}

/** 约束报告（Constraint Engine 输出） */
export interface ConstraintReport {
  feasible: boolean;
  violations: ConstraintViolationItem[];
  feasibleActions?: string[];
  /** 硬约束违反数量（用于 differentiable-decision） */
  hardViolationCount?: number;
  /** 软约束满足率 (0-1)（用于 differentiable-decision） */
  softSatisfactionRate?: number;
  /**
   * 与 `GateResult.gate_result` 对齐（G-01）。
   * 当为 `NEED_USER_CONFIRM` 时，仅用 `feasible`/`violations` 无法与 `ADJUST_REQUIRED` 区分，往返映射时必须显式携带。
   */
  gateOutcome?: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
}

/**
 * 可行域判定：专利形式 g_i(s,a) ≤ 0, ∀i
 * 方案在可行域内 ⟺ 所有约束满足（violations 为空或所有 degree≤0）
 */
export function isInFeasibleRegion(cr: ConstraintReport | undefined): boolean {
  if (!cr) return true;
  const violations = cr.violations ?? [];
  return cr.feasible && violations.every((v) => (v.degree ?? 1) <= 0);
}

/**
 * 优化提示（Optimization Engine 输出，给 LLM 的趋势信息）
 *
 * 未来扩展：多目标优化模型
 * ExpectedUtility = w1·Safety + w2·Experience + w3·TimeSlack + w4·Cost - w5·Fatigue - w6·Risk
 */
/** 维度得分（0-1，越高表示该维度风险/惩罚越大） */
export interface DimensionBreakdown {
  /** 疲劳风险 (0-1) */
  fatigue?: number;
  /** 天气风险 (0-1) */
  weather?: number;
  /** 预算超支风险 (0-1) */
  budget?: number;
  /** 避流/拥挤风险 (0-1) */
  crowdAvoidance?: number;
}

/** Monte Carlo 置信区间（专利：世界状态不确定性时） */
export interface MonteCarloConfidenceInterval {
  lower: number;
  upper: number;
  level: number;
}

/** 约束松弛项（用于显式标注“放宽了什么/为什么”） */
export interface ConstraintRelaxation {
  /** 松弛标识（稳定可审计） */
  id: string;
  /** 约束类型/编码（与 ConstraintViolationItem.type 对齐） */
  constraintType: string;
  /** 松弛原因（例如：用户选择更激进策略/低功耗降级/无可行解时的应急） */
  reason: string;
  /** 严重度：HARD 的松弛必须显式标注（专利口径） */
  severity: 'HARD' | 'SOFT';
  /** 松弛程度 (0-1)，0 表示未松弛，1 表示完全放宽 */
  degree: number;
}

export interface CandidateSearchBudget {
  maxCandidates: number;
  repairMaxIters: number;
  repairTopKPerCandidate: number;
  maxNewCandidatesPerIter: number;
  maxPoolSize: number;
  stopWhenFeasibleCount?: number;
}

export interface CandidateSearchAudit {
  budget: CandidateSearchBudget;
  initialVariantCount: number;
  iterations: Array<{
    iter: number;
    poolSizeBeforeProjection: number;
    feasibleCountAfterProjection: number;
    infeasibleCountAfterProjection: number;
    repairsGenerated: number;
    repairsAccepted: number;
    poolSizeAfterDedup: number;
  }>;
  finalCandidateCount: number;
  finalFeasibleCount: number;
  stopReason:
    | 'FEASIBLE_TARGET_REACHED'
    | 'REPAIR_ITER_LIMIT'
    | 'MAX_NEW_CANDIDATES_REACHED'
    | 'MAX_POOL_SIZE_REACHED'
    | 'DIVERSITY_SELECTION'
    | 'COMPLETED';
}

export interface OptimizationHints {
  safetyTrend?: 'LOW' | 'MEDIUM' | 'HIGH';
  fatigueTrend?: 'LOW' | 'MEDIUM' | 'HIGH';
  weightSummary?: Record<string, number>;
  strategyDirection?: string;
  /** 生成 Hints 的方法，用于解释与诊断 */
  method?: 'CGUS' | 'MONTE_CARLO' | 'HEURISTIC';
  /** 未来：多目标优化标量输出 */
  expectedUtility?: number;
  /** 未来：目标权重 w1..w6（Safety/Experience/TimeSlack/Cost/Fatigue/Risk） */
  expectedUtilityWeights?: Record<string, number>;
  /** 各维度实际得分（解决「疲劳/天气/预算/避流始终为0」） */
  dimensionBreakdown?: DimensionBreakdown;
  /** Monte Carlo 置信区间（专利：不确定性时采用 Monte Carlo 模拟） */
  confidenceInterval?: MonteCarloConfidenceInterval;
  /**
   * 地形/爬升带来的认知不确定性：CGUS 中 effort01 会放大 MC 置信区间半宽。
   */
  terrainEpistemicUncertainty?: {
    effort01: number;
    confidenceIntervalInflation: number;
  };
  /**
   * 早期预警码（如高地形方差），供 Decision OS / Narrator 与审计消费。
   */
  earlyWarningCodes?: string[];
  /** 可行性概率 P(all hard constraints satisfied) */
  feasibilityProbability?: number;
  /** Phase 2：不确定性概要，用于信念状态判断 */
  uncertaintyProfile?: UncertaintyProfile;
  /**
   * Kernel fail-safe：当元决策预算不足以支撑高风险优化时，明确给出降级动作。
   * - BLOCK: 禁止继续推进优化（需要用户/外部系统干预）
   * - ADJUST_REQUIRED: 允许继续，但要求收缩目标/降低复杂度/补充信息后重试
   */
  failSafeAction?: 'BLOCK' | 'ADJUST_REQUIRED';
  /** fail-safe 触发原因（稳定可审计） */
  failSafeReason?: string;
  /**
   * CGUS / OPTIMIZE 解释用的候选摘要（Top-N）
   * 用于向用户展示“我比较了哪些备选、为什么推荐这个”
   */
  alternatives?: Array<{
    id: string;
    /** 排序分数（通常为 expectedUtility；缺失时退化为 utility） */
    score: number;
    /** Rollout-aware final score（当启用 rollout-aware rerank 时） */
    finalScore?: number;
    /** 分数拆解（用于解释与回放） */
    scoreBreakdown?: {
      baseU: number;
      baseP: number;
      rolloutU?: number;
      rolloutP?: number;
      blendedU: number;
      blendedP: number;
    };
    expectedUtility?: number;
    feasibilityProbability?: number;
    confidenceInterval?: MonteCarloConfidenceInterval;
    /** 候选摘要（用于避免伪多解：可人读/可审计的差异点） */
    summary?: string;
    /** 本候选使用的松弛清单（若存在） */
    relaxations?: ConstraintRelaxation[];
    /** 违反列表（简化版），用于解释“为何被拒绝/降级” */
    violations?: Array<Pick<ConstraintViolationItem, 'type' | 'severity' | 'degree' | 'detail'>>;
    /** 用于多样性去重的签名（内部诊断字段） */
    diversitySignature?: string;
  }>;
  /** 推荐候选 id（若已计算） */
  recommendedAlternativeId?: string;

  /**
   * 元决策预算审计摘要（人读/可截图）
   * 例：`META_BUDGET(sample=240,topK=8,H=4,entropy=0.92,ESS=120.3)`
   */
  metaDecisionAudit?: string;

  /** CGUS rollout horizon（步数），由 Kernel 的 planningDepth 映射而来 */
  rolloutHorizonSteps?: number;
  /** Candidate generation / repair budget（由 uncertaintyProfile 驱动） */
  candidateSearchBudget?: CandidateSearchBudget;
  /** Candidate generation / repair 审计（证明元预算如何影响搜索行为） */
  candidateSearchAudit?: CandidateSearchAudit;
}

/** 决策模式（Decision Meta - 系统稳定性关键） */
export type DecisionMetaMode = 'PLAN' | 'ADJUST' | 'EXPLORE' | 'EMERGENCY';

/** 决策阶段（高层面） */
export type DecisionMetaPhase = 'INTAKE' | 'PLAN' | 'VERIFY';

/** 决策策略 */
export type DecisionMetaStrategy = 'CONSERVATIVE' | 'BALANCED' | 'AGGRESSIVE';

/** 决策元数据（模式、阶段、策略 - 极大提升系统稳定性） */
export interface DecisionMeta {
  mode?: DecisionMetaMode;
  phase?: DecisionMetaPhase;
  strategy?: DecisionMetaStrategy;
}

/** 状态变化差分类型（Token 优化：只记录变化） */
export type StateHistoryDeltaType = 'weather' | 'userIntent' | 'delay' | 'constraints' | 'plan' | string;

/** History 事件元信息（兼容扩展） */
export interface StateHistoryDeltaMeta {
  request_id?: string;
  trace_id?: string;
  version?: number;
  status?: string;
  signal_type?: string;
  [key: string]: unknown;
}

/** 状态变化差分条目 */
export interface StateHistoryDelta {
  type: StateHistoryDeltaType;
  /** 变化摘要（供 LLM/审计，非全量） */
  summary?: string;
  /** 时间戳 ISO 8601 */
  at: string;
  /** 可选：变化前后快照（用于审计，可压缩） */
  prev?: unknown;
  next?: unknown;
  /** 可选：审计扩展信息（request/trace/version/status 等） */
  meta?: StateHistoryDeltaMeta;
  /** 可选：仲裁/冲突等结构化载荷（如 kernel_arbitration） */
  payload?: unknown;
}

/** 状态变化历史（RLHF/异常检测/模型评估核心） */
export type DecisionStateHistory = StateHistoryDelta[];

/**
 * Harness Runtime 在 DSO 上的可选挂载点（证据快照、幂等、trace 指针）
 * 见 docs/Harness Runtime.md
 */
/**
 * Kernel 影子 Harness（`HARNESS_SHADOW_AFTER_PHASE=1`）：不阻断主链，供 explain / 监控看板。
 * 演练期建议观测：（A）契约虚警率——内核/ EU 逻辑变更后 DeterministicValidators 是否滞后导致大量 `harness_warning`；
 * （B）恢复误判——`validateStepAdmission` / 投影是否因 `readableStatePaths` 或 DSO 缺字段而误失败。
 */
export interface HarnessShadowHarnessEvent {
  kernel_phase: string;
  harness_step: string;
  run_status: string;
  shadow_enforcement: true;
  /** 非 PASSED 时的人读告警（API explain 高亮） */
  harness_warning?: string;
  validation_results: Array<{
    passed: boolean;
    code?: string;
    message: string;
    severity?: string;
  }>;
  recorded_at: string;
}

export interface HarnessRuntimeState {
  /** RESEARCH 冻结后写入；VERIFY 必须绑定该 id，异步刷新须 bump */
  researchEvidenceSnapshotId?: string;
  /** 与快照一致的可读版本（可选，审计展示） */
  evidenceVersion?: string;
  /** 本 request 已成功提交的幂等键（工具调用或写路径） */
  committedIdempotencyKeys?: string[];
  /** 当前活跃 harness trace id */
  activeTraceId?: string;
  /**
   * Evaluation Harness 单次运行 id（与 `runFingerprint.runId`、`POST /agent/route_and_run` 的 `meta.run_id` 对齐），
   * 写入内存 `HarnessTrace.meta.evaluationRunId`，供 replay/compare 与执行层 trace 关联。
   */
  evaluationRunId?: string;
  /**
   * 若设置 `HARNESS_TRACE_EXPORT_DIR` 且落盘成功：相对 `process.cwd()` 的 POSIX 路径（replay `traceRefs.path` / API observability）。
   */
  traceExportRelativePath?: string;
  /** 各 `executePhase` 结束后影子 Harness 校验累积（不替代主路 pre-phase Harness） */
  shadow_harness_events?: HarnessShadowHarnessEvent[];
  /** Durable 恢复：准入通过的 Harness 步骤 */
  resume_admission_step?: HarnessStepName | string;
  resume_admission_passed?: boolean;
}

/** Phase 1.5：区域解析溯源（可观测 / 排障） */
export type PoiPlanningResolutionSource = 'region_intent_resolver';

export interface PoiPlanningResolutionMeta {
  source: PoiPlanningResolutionSource;
  matchedBy: 'region_id' | 'keyword' | 'message_text';
  /** 命中的关键词或模式标签（审计用，非自然语言全文） */
  matchedRegionKeyword?: string;
}

/**
 * POI 区域骨架与日程预算（DSO 显式挂载）
 * 见 docs/POI_REGION_INTENT_PHASE1.md
 */
export interface PoiPlanningDecisionSlice {
  routeIntent?: {
    regionId?: string;
    regionName?: string;
    confidence?: number;
    mustCoverAnchors?: boolean;
  };
  poiPlan?: {
    requiredAnchorPoiIds: string[];
    optionalCandidatePoiIds: string[];
    excludedPoiIds: string[];
    selectedOptionalPoiIds: string[];
  };
  schedulePlan?: {
    totalBudgetMinutes: number;
    requiredCostMinutes: number;
    optionalCapacityMinutes: number;
    bufferMinutes: number;
    feasibility: 'ok' | 'tight' | 'failed';
  };
  /** 区域意图如何命中（显式字段，便于排查） */
  resolution?: PoiPlanningResolutionMeta;
  /** 预算门控实际触发的回退步骤 id */
  appliedBackoffSteps?: string[];
  /** 是否因 tight/failed/cap≤0 收缩了 optional（排序约束语义） */
  budgetGateApplied?: boolean;
  /** 供 NARRATE / 前端展示的预算与骨架说明 */
  narrationHint?: string;
}

/**
 * Decision State Object (DSO)
 *
 * 所有 Agent 共享的单一状态结构
 */
export interface DecisionState {
  /** 用户意图 */
  userIntent: UserIntent;

  /** 行程状态 */
  tripState: TripState;

  /** 环境状态 */
  environmentState: EnvironmentState;

  /** 系统状态 */
  systemState: SystemState;

  /** 约束（Constraint Engine 输出） */
  constraints?: ConstraintReport;

  /** 候选方案 */
  candidates?: unknown[];

  /** 优化提示（给 LLM，非公式） */
  optimizationHints?: OptimizationHints;

  /** 风险等级 */
  riskLevel?: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';

  /** Context Package（Context Engine 构建，强类型） */
  contextPackage?: ContextPackage;

  /** 决策元数据（模式、阶段、策略 - 系统稳定性关键） */
  decisionMeta?: DecisionMeta;

  /** 状态变化摘要（只记录 Δ，Token 优化；RLHF/异常检测核心） */
  history?: DecisionStateHistory;

  /** 当前决策置信度 [0,1]（模型评估、自动学习、异常检测 - Autonomous Agent 必备） */
  confidence?: number;

  /** Scheme C: 世界模型三段式摘要（物理环境、用户能力、路线规则） */
  worldStateSummary?: WorldStateSummary;

  /**
   * Phase 2 研究级：信念状态 b(s) = P(s|observations) 的工程近似
   * 当世界状态存在不确定性时，通过 Monte Carlo 采样表示信念分布
   * 参考：docs/Decision_OS_技术交底书.md 3.2
   */
  beliefSamples?: BeliefStateSample[];

  /**
   * Phase 2 研究级：不确定性概要，用于快速判断是否启用信念状态逻辑
   * 当 weatherRisk、failureRiskLevel 等存在时，可推断 uncertaintyProfile
   */
  uncertaintyProfile?: UncertaintyProfile;

  /**
   * 用户反馈（专利实施例 6.1.5，FEEDBACK 阶段通过 STATE_UPDATE 写入）
   * 用户查看/采纳/修改行程后的反馈，供反馈学习模块使用
   */
  feedback?: DecisionStateFeedback;

  /** 兼容：关联 request_id 便于与现有 OrchestratorState 映射 */
  requestId?: string;

  /**
   * 旅行本体扩展状态（Data/Logic/Action 融合）
   * 作为 DSO 子状态保存，避免引入平行状态源。
   */
  travelOntologyState?: {
    /** 业务行程 ID（与 trips 域对齐时的主键） */
    tripId?: string;
    nouns?: {
      flights?: Array<{
        id: string;
        flightNo?: string;
        airline?: string;
        from?: string;
        to?: string;
        departureTime?: string;
        arrivalTime?: string;
        price?: number;
      }>;
      hotels?: Array<{
        id: string;
        name?: string;
        checkIn?: string;
        checkOut?: string;
        nightlyPrice?: number;
        roomAvailable?: boolean;
      }>;
      activities?: Array<{
        id: string;
        name?: string;
        type?: string;
        startTime?: string;
        endTime?: string;
        location?: string;
        price?: number;
      }>;
      destination?: {
        id?: string;
        name?: string;
        countryCode?: string;
      };
      transportation?: Array<{
        id?: string;
        mode: 'RAIL' | 'SUBWAY' | 'TAXI' | 'BIKE' | 'BUS' | 'WALK' | 'MIXED';
        provider?: string;
        etaMinutes?: number;
        costEstimate?: number;
      }>;
    };
    verbs?: {
      pending?: Array<{
        actionId: string;
        verb:
          | 'BOOK'
          | 'CANCEL'
          | 'ADJUST'
          | 'NOTIFY'
          | 'OPTIMIZE'
          | 'MODIFY'
          | 'SELECT'
          | 'PAY';
        targetType: 'FLIGHT' | 'HOTEL' | 'ACTIVITY' | 'TRANSPORT' | 'ITINERARY';
        targetRef?: string;
        requiresConfirmation: boolean;
        riskLevel: 'LOW' | 'MEDIUM' | 'HIGH';
      }>;
      committed?: string[];
      rolledBack?: string[];
    };
  };

  /** Harness Runtime 切片（与 travelOntologyState 并列，避免深层合并） */
  harnessRuntime?: HarnessRuntimeState;

  /** POI 区域骨架、锚点与预算（Phase 1） */
  poiPlanning?: PoiPlanningDecisionSlice;

  /**
   * VERIFY 结构化结果（Phase 3）
   * - 以结构化 issue 取代纯 string[]，用于：是否可修复、是否阻塞 DONE、Explain / Guardrails
   */
  verification?: VerificationReport;
}

export type VerificationIssueClass = 'FATAL' | 'CONFLICT' | 'ADVISORY';

export type VerificationIssueCode =
  | 'DESTINATION_CLOSED_DISASTER'
  | 'BUDGET_ORDER_OF_MAGNITUDE_MISMATCH'
  | 'POI_CLOSED'
  | 'TIME_WINDOW_BREACH'
  | 'TIME_WINDOW_OVERLAP'
  | 'ROUTE_INFEASIBLE'
  | 'TERRAIN_F_ROAD_UNFIT'
  | 'FATIGUE_HIGH'
  | 'FATIGUE_OVERLOAD'
  | 'WEATHER_RISK'
  | 'CONFIDENCE_DEGRADED'
  | 'SUNSET_BREACH'
  | 'UNKNOWN';

export interface VerificationIssueMetadata {
  /** 对 DSO.confidence 的增量（通常为负），由 Kernel/编排层汇总 */
  confidence_impact?: number;
  /** 证据形态（营业时间等） */
  evidenceKind?: 'PERIODS' | 'IS_OPEN_NOW_ONLY' | 'WEEKDAY_TEXT_ONLY' | 'NONE';
}

export interface VerificationIssue {
  /** 稳定、可聚合的机器码（用于指标/回放/guardrail） */
  code: VerificationIssueCode;
  /** 可修复性分类：FATAL=不可修复；CONFLICT=可自动修复；ADVISORY=提示不阻塞 */
  class: VerificationIssueClass;
  /** 人类可读描述（可直接进入 explain.warnings / failure reason） */
  message: string;
  /** 结构化元数据（置信度降级、证据形态等） */
  metadata?: VerificationIssueMetadata;
  /** 可选：关联实体（如 POI id、day index、segment id） */
  entityRef?: { type: 'POI' | 'DAY' | 'SEGMENT' | 'BUDGET' | 'DESTINATION' | 'OTHER'; id?: string };
  /** 可选：建议动作（供 RepairExecutor / UI / HITL） */
  suggestedActions?: Array<{ action: 'REPLACE' | 'REORDER' | 'RELAX' | 'ASK_USER' | 'BLOCK'; detail?: string }>;
  /** 可选：置信度 [0,1]（用于 conflict resolution / explain） */
  confidence01?: number;
  /**
   * 溯源：由谁提出（verify skill / feasibility engine / harness）
   * - ENVIRONMENTAL_CONSTRAINTS：日照/可视窗口等与「路通不通」正交的硬约束（如 solveDayTimeline 日落 LIMIT）
   */
  source?:
    | 'ROUTE_FEASIBILITY'
    | 'ENVIRONMENTAL_CONSTRAINTS'
    | 'ITINERARY_VERIFY_SKILL'
    | 'EXPERIENCE_AGENT'
    | 'HARNESS'
    | 'OTHER';
  /** 时间戳（便于回放） */
  at?: string;
}

/** REPAIR 无法闭环时上收到 DSO，供 NARRATE / HITL 读取（决策层，非仅 itinerary.metadata） */
export type RepairEscalationType = 'PHYSICAL_LIMIT_REACHED';

/** 澄清回传标签，与 `decision-feedback-correlation.util` 字符串枚举对齐 */
export type UserRepairResolutionLabel =
  | 'ACCEPTED_AUTO_REPAIR'
  | 'RELAXED_CONSTRAINTS'
  /** 先知卡等：用户知晓风险后仍选择保持现状继续 */
  | 'PROCEED_REGARDLESS'
  | 'ABANDONED';

/** 反馈所针对的因果阶段（与 correlation 的 phase/kind 对齐审计） */
export type UserRepairResolutionFeedbackPhase = 'INTAKE' | 'REPAIR';

/** 单条用户修复决策反馈（按 correlationId 幂等追加） */
export interface UserRepairResolutionEvent {
  correlationId: string;
  resolution: UserRepairResolutionLabel;
  recordedAt: string;
  /** 缺省视为 REPAIR（历史数据兼容） */
  feedbackPhase?: UserRepairResolutionFeedbackPhase;
}

export interface RepairEscalationPlan {
  type: RepairEscalationType;
  /** 与 TimelineFeasibility.status 或业务原因码对齐 */
  reason: string;
  bottleneckNodeId?: string;
  suggestedAction?: string;
  userClarificationSnippet: string;
  at: string;
  /** 物理连通性 vs 日落可视窗口 */
  constraint?: 'PHYSICAL_CONNECTIVITY' | 'SUNSET_VISIBILITY';
  /**
   * 因果指纹：sha256(sessionId|repairRound|stateHash) 截断；澄清 payload 原样回传以 join 审计/训练语料。
   */
  correlationId?: string;
}

export interface VerificationReport {
  issues: VerificationIssue[];
  /** 是否存在 FATAL（不可修复）issue：为 true 时应跳过 REPAIR，推向 FAILED */
  hasFatal: boolean;
  /** 是否存在 CONFLICT（可自动修复）issue：为 true 时可触发 REPAIR */
  hasConflict: boolean;
  /** 是否存在 ADVISORY（软警告）：不阻塞 DONE，但应进入 explain.warnings */
  hasAdvisory: boolean;
  /** 统计摘要（便于观测与 guardrail） */
  counts: { fatal: number; conflict: number; advisory: number };
  /** 最近一次 VERIFY 时间 */
  verifiedAt: string;
  /** REPAIR 极限/编排升级信号（与 issues 并列，便于 NARRATE 精准引用） */
  escalationPlan?: RepairEscalationPlan;
}

/** 信念状态采样（b(s) 的离散近似） */
export interface BeliefStateSample {
  sampleId: string;
  /** 采样的环境状态摘要 */
  environmentSummary?: Record<string, number>;
  /** 粒子权重（归一化后为概率） */
  weight?: number;
  /** 采样的效用或可行性得分 */
  utility?: number;
  feasibilityScore?: number;
}

/** 不确定性概要 */
export interface UncertaintyProfile {
  /** 是否存在显著不确定性（天气、路况、人体能力等） */
  hasUncertainty: boolean;
  /** 主要不确定性来源 */
  sources?: Array<'weather' | 'road' | 'human' | 'budget'>;
  /**
   * 不确定性熵（归一化到 [0,1] 的工程指标）
   * - 0：近似确定
   * - 1：高度不确定
   */
  entropy01?: number;
  /** 有效粒子数（ESS / effective particle count），用于触发重采样/预算调节 */
  effectiveParticleCount?: number;
  /** 建议采样数量（用于 Monte Carlo） */
  suggestedSampleSize?: number;
  /**
   * 元决策：世界模型 rollout 的 Top-K（CGUS Step 4）
   * - 由不确定性/粒子退化信号驱动（Kernel 写入，Adapter 消费）
   */
  rolloutTopK?: number;
  /**
   * 元决策：规划深度（多步展开预算的抽象旋钮）
   * - 当前作为可审计预算字段；具体解释由各优化器自行映射
   */
  planningDepth?: number;
}

/**
 * DSO 用户反馈（专利实施例 6.1.5）
 * 用户查看/采纳/修改行程后的反馈，通过 STATE_UPDATE 原子写入 DSO
 */
export interface DecisionStateFeedback {
  /** 是否采纳方案 */
  accepted?: boolean;
  /** 用户修改项（如「将第2天改为酒庄参观」） */
  modifications?: string[];
  /** 满意度评分（如 4.6/5） */
  satisfactionScore?: number;
  /** 行为信号 */
  behaviorSignals?: {
    savePlan?: boolean;
    sharePlan?: boolean;
    exportPlan?: boolean;
  };
  /** 反馈时间 ISO 8601 */
  submittedAt?: string;
}

/** 从 OrchestratorState 投影为 DecisionState 的辅助类型 */
export type DecisionStatePatch = Partial<DecisionState>;

/** 创建 StateHistoryDelta 的便捷参数 */
export interface AppendHistoryDeltaParams {
  type: StateHistoryDeltaType;
  summary?: string;
  prev?: unknown;
  next?: unknown;
}

/** 状态更新事务（专利权利要求 7：原子提交） */
export interface StateUpdateTransaction {
  requestId: string;
  expectedVersion: number;
  patch: DecisionStatePatch;
  stageOutput?: string;
}

/** 原子提交结果 */
export interface StateCommitResult {
  newState: DecisionState;
  newVersion: number;
  conflict?: boolean;
  /** 当启用严格稳定性策略时，若检测到不稳定则回滚并返回旧状态 */
  rolledBack?: boolean;
  /** 回滚原因（用于审计与可观测） */
  rollbackReason?: 'LYAPUNOV_INCREASE' | 'UNKNOWN';
}

/** 阶段优先级（专利权利要求 6：多模块更新同一字段时，阶段优先级确定最终状态） */
export const STAGE_PRIORITY: Record<string, number> = {
  INTAKE: 1,
  RESEARCH: 2,
  GATE_EVAL: 3,
  CONTEXT_BUILD: 4,
  PLAN_GEN: 5,
  OPTIMIZE: 6,
  VERIFY: 7,
  REPAIR: 8,
  NARRATE: 9,
  FEEDBACK: 10,
  STATE_UPDATE: 0, // 同步步骤，不参与优先级
};

/** 状态提交冲突错误 */
export class StateCommitConflictError extends Error {
  constructor(
    public readonly expectedVersion: number,
    public readonly actualVersion: number,
  ) {
    super(`State commit conflict: expected version ${expectedVersion}, actual ${actualVersion}`);
    this.name = 'StateCommitConflictError';
  }
}

/** 阶段合法性错误：当前阶段不允许写入某些字段 */
export class StateCommitPhaseViolationError extends Error {
  constructor(
    public readonly phase: string,
    public readonly touchedPaths: string[],
    public readonly allowedPrefixes: string[],
  ) {
    super(
      `State commit phase violation: phase=${phase} touched=[${touchedPaths.join(
        ',',
      )}] allowed=[${allowedPrefixes.join(',')}]`,
    );
    this.name = 'StateCommitPhaseViolationError';
  }
}
