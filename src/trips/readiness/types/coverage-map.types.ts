// src/trips/readiness/types/coverage-map.types.ts

/**
 * Coverage Map Types
 * 
 * 定义覆盖地图相关的数据类型
 */

import type { ReadinessTripFindingScope } from './readiness-findings.types';
import type { CoverageDisclosure } from '../../../travel-cognition';
import type { NonTransactionalReplanResult } from '../../../travel-cognition';
import type { GuardianPersonaPresentation } from '../../decision/shared/guardian-presentation.types';
import type { ResolvedSegmentDistanceThresholds } from '../../trip-constraint-solver/utils/segment-distance-threshold.util';

// ==================== 准备度分数类型 ====================

/**
 * 准备度分数详情
 */
export interface ReadinessScoreBreakdown {
  overall: number;              // 总体分数 0-100
  evidenceCoverage: number;     // 证据覆盖率 0-100
  scheduleFeasibility: number;  // 时间可行性 0-100
  transportCertainty: number;   // 交通确定性 0-100
  safetyRisk: number;           // 安全风险分数 0-100 (越高越安全)
  buffers: number;              // 缓冲时间分数 0-100
}

/**
 * 准备度发现项
 */
export interface ReadinessScoreFinding {
  id: string;
  /**
   * 🆕 统一类型命名：
   * - 'blocker': 阻塞项
   * - 'must': 必须项（原 'warning'）
   * - 'should': 建议项（原 'suggestion'）
   * 向后兼容：仍支持 'warning' 和 'suggestion'，但建议使用新命名
   */
  type: 'blocker' | 'must' | 'should' | 'warning' | 'suggestion';
  category: string;
  message: string;
  severity: 'high' | 'medium' | 'low';
  affectedDays?: number[];
  actionRequired?: string;
  fromItemId?: string;
  toItemId?: string;
  issueKind?: string;
  anchors?: Record<string, unknown>;
  uiHints?: Record<string, unknown>;
  /** POI Access Engine — 与 feasibility issues[].visitorAccess 同形 */
  visitorAccess?: {
    evaluation: {
      verdict: string;
      poiId: string;
      message: string;
      confidence: string;
      planBHints: Array<{
        action: string;
        detail: string;
        suggestedArrivalTime?: string;
        alternativePoiId?: string;
      }>;
      crowding?: {
        crowdLevel?: string;
        predictedWaitP50?: number;
        predictedWaitP90?: number;
        disclosureLabel?: string;
      };
    };
    hasReservationEvidence?: boolean;
    deferredLive?: boolean;
  };
  /** 与树形 findings 对齐：覆盖缺口时的行程定位 */
  tripScope?: ReadinessTripFindingScope;
}

/**
 * 准备度风险项
 */
export interface ReadinessScoreRisk {
  id: string;
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
  mitigation?: string[];
  affectedPois?: string[];
}

/**
 * 准备度分数响应
 */
export interface ReadinessScoreResponse {
  tripId: string;
  score: ReadinessScoreBreakdown;
  findings: ReadinessScoreFinding[];
  risks: ReadinessScoreRisk[];
  summary: {
    totalFindings: number;
    blockers: number;
    /**
     * 🆕 统一字段命名：必须项数量（对应 must）
     * 向后兼容：同时保留 warnings 字段
     */
    must: number;
    /**
     * 🆕 统一字段命名：建议项数量（对应 should）
     * 向后兼容：同时保留 suggestions 字段
     */
    should: number;
    /**
     * @deprecated 使用 must 替代
     * 向后兼容：保留此字段，值等于 must
     */
    warnings?: number;
    /**
     * @deprecated 使用 should 替代
     * 向后兼容：保留此字段，值等于 should
     */
    suggestions?: number;
    highRisks: number;
    mediumRisks: number;
    lowRisks: number;
  };
  calculatedAt: string;
  /** 行程所处准备阶段（影响分数是否计入临行项） */
  readinessPhase?: 'planning' | 'pre_departure' | 'in_trip' | 'past';
  daysUntilStart?: number;
  phaseHint?: string;
  /** 最近一次三人格博弈快照（来自 apply-repair / 决策修复） */
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
  /** 决策覆盖声明：基于哪些数据判断、哪些未覆盖 */
  coverageDisclosure?: CoverageDisclosure;
  /** 最近一次级联影响预分析（trip.metadata 持久化 + 实时计算） */
  causalPreAnalysis?: import('../../../travel-cognition').NonTransactionalReplanResult;
  /** 供准备度 UI 渲染的级联提示卡片 */
  cascadeUiHints?: ReadinessCascadeUiHint[];
}

/** 级联影响 UI 提示（repair-options / score 页面） */
export interface ReadinessCascadeUiHint {
  id: string;
  riskLevel: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
  message: string;
  recommendation: string;
  entityKind?: string;
  entityLabel?: string;
  userConfirmationRequired?: string[];
  /** Impact Algebra：净时间影响（分钟） */
  netImpactMinutes?: number;
  absorbedMinutes?: number;
  /** 级联传播置信度 0..1 */
  cascadeConfidence?: number;
  propagationHop?: number;
  triggerFactType?: string;
  triggerSource?: string;
}

/** trip.metadata.readinessCausalPreAnalysis 快照 */
export interface ReadinessCausalPreAnalysisSnapshot {
  latest?: import('../../../travel-cognition').NonTransactionalReplanResult;
  byBlockerId?: Record<string, import('../../../travel-cognition').NonTransactionalReplanResult>;
  updatedAt?: string;
}

/**
 * 三人格博弈 — 单次协商摘要（供 score / insight / apply-repair 展示）
 */
export interface ReadinessGuardianPersonaSummary {
  persona: 'ABU' | 'DRE' | 'NEPTUNE';
  personaLabel: string;
  stance: string;
  utility: number;
  primaryConcerns: string[];
}

export interface ReadinessGuardianFatigueDaySummary {
  dayIndex: number;
  fatigueScore: number;
  riskLevel: string;
  recommendation: string;
  confidence?: number;
}

export interface ReadinessGuardianNegotiationSummary {
  /** pre/post_repair：修复闭环；standalone：智能体/MCP 独立调用 */
  phase: 'pre_repair' | 'post_repair' | 'standalone';
  tripId: string;
  repairActionType?: string;
  blockerId?: string;
  decision: 'APPROVE' | 'REJECT' | 'CONDITIONAL_APPROVE' | 'REQUIRES_HUMAN';
  consensusLevel: number;
  humanDecisionPoints: string[];
  conditions: string[];
  keyTradeoffs: string[];
  summary: string;
  debateRoundCount: number;
  suggestedAdjustments?: string[];
  personaEvaluations: ReadinessGuardianPersonaSummary[];
  fatiguePrediction?: ReadinessGuardianFatigueDaySummary[];
  negotiatedAt: string;
}

export interface ReadinessGuardianNegotiationSnapshot {
  preRepair?: ReadinessGuardianNegotiationSummary;
  postRepair?: ReadinessGuardianNegotiationSummary;
  latest?: ReadinessGuardianNegotiationSummary;
}

/** repair-options 抽屉 Guardian 面板 — 与前端契约对齐 */
export type RepairOptionsGuardianConsensus = 'ALIGNED' | 'SPLIT' | 'BLOCKED';

export type RepairOptionsGuardianPersonaCode = 'ABU' | 'DR_DRE' | 'NEPTUNE';

export type RepairOptionsGuardianStance = 'SUPPORT' | 'CAUTION' | 'OPPOSE' | 'NEUTRAL';

export interface RepairOptionsGuardianPersonaView {
  persona: RepairOptionsGuardianPersonaCode;
  stance: RepairOptionsGuardianStance;
  message: string;
  suggestion?: string;
  highlights?: string[];
}

export interface RepairOptionsGuardianNegotiationView {
  consensus?: RepairOptionsGuardianConsensus;
  summary?: string;
  personas: RepairOptionsGuardianPersonaView[];
  userActionRequired?: string[];
  analyzedAt?: string;
}

// ==================== 修复选项类型 ====================

/**
 * 修复选项请求
 */
export interface RepairOptionsRequest {
  tripId: string;
  blockerId: string;
}

/**
 * 修复选项
 */
export interface RepairOption {
  id: string;
  title: string;
  description: string;
  cost?: number;
  impact: 'high' | 'medium' | 'low';
  timeEstimate?: string;
  actionType?: string;
  payload?: Record<string, unknown>;
  metadata?: Record<string, any>;
}

/**
 * 修复选项响应
 */
export interface RepairOptionsResponse {
  /** feasibility 路径参数 issueId（与 issues[].id 对齐） */
  issueId?: string;
  blockerId: string;
  blockerMessage?: string;
  options: RepairOption[];
  /** 修复前级联影响预分析（封路/天气/F-road → 下游 POI/当日） */
  dependencyImpact?: NonTransactionalReplanResult;
  causalPreAnalysis?: NonTransactionalReplanResult;
  /** 供 repair-options 弹层直接渲染 */
  cascadeUiHints?: ReadinessCascadeUiHint[];
  /** 修复前三人格协商预览（repair-options 抽屉 Guardian 面板） */
  guardianNegotiation?: RepairOptionsGuardianNegotiationView;
}

/**
 * 应用修复请求
 */
export interface ApplyRepairRequest {
  tripId: string;
  blockerId: string;
  optionId: string;
  reason?: string;
  /** 为 true 时，计划类修复会直接调用决策引擎 repair-plan（否则仅 redirect） */
  executeDecision?: boolean;
  /** executeDecision=true 时是否将 decisionPlan 写回 ItineraryItem，默认 true */
  persistDecision?: boolean;
  /** executeDecision=true 时是否运行三人格博弈（默认 true；全局可用 READINESS_GUARDIAN_NEGOTIATION=0 关闭） */
  runGuardianNegotiation?: boolean;
  /** 为 true 时跳过 pre_repair 低共识 REJECT 门控，强制执行 Neptune 修复 */
  forceDecisionRepair?: boolean;
}

/**
 * 应用修复结果状态
 */
export type ApplyRepairStatus = 'applied' | 'deferred' | 'redirect';

/**
 * 应用修复响应
 */
export interface ApplyRepairResponse {
  tripId: string;
  blockerId: string;
  optionId: string;
  actionType: string;
  status: ApplyRepairStatus;
  message: string;
  readinessScore?: ReadinessScoreResponse;
  redirectUrl?: string;
  metadata?: Record<string, unknown>;
  /** 决策引擎 repair-plan 返回的计划（executeDecision=true 时） */
  decisionPlan?: Record<string, unknown>;
  decisionLog?: Record<string, unknown>;
  /** 当前版本仅返回修复计划，尚未写回 Prisma 行程 */
  persisted?: boolean;
  persistence?: {
    applied: boolean;
    updatedItemIds: string[];
    createdItemIds: string[];
    removedItemIds: string[];
    skippedLockedItemIds: string[];
  };
  /** 修复前后的三人格博弈结果（executeDecision + runGuardianNegotiation 时） */
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
  /** status=deferred 时扁平 CHOOSE 选项（source: readiness_repair） */
  humanDecisionPointsFlat?: string[];
  /** deferred 时可选单主角表达（与 guardian/choose presentation 同构） */
  presentation?: GuardianPersonaPresentation;
}

export type RepairPreviewMode = 'heuristic' | 'decision_engine_dry_run';

export type PreviewRepairStatus = 'preview' | 'would_defer';

/**
 * 修复预览请求（feasibility preview-repair / readiness 共用）
 */
export interface PreviewRepairRequest {
  tripId: string;
  blockerId: string;
  optionId: string;
  /** feasibility issue id（审计/UI 用，可选） */
  issueId?: string;
  /** 受影响日序号（feasibility issue.affectedDays[0]） */
  affectedDayNumber?: number;
  runGuardianNegotiation?: boolean;
  forceDecisionRepair?: boolean;
}

/**
 * 修复预览响应 — decision_engine_dry_run 与 apply-repair 同路径但不写库
 */
export interface PreviewRepairResponse {
  tripId: string;
  blockerId: string;
  issueId?: string;
  optionId: string;
  actionType: string;
  previewMode: RepairPreviewMode;
  status: PreviewRepairStatus;
  message: string;
  before: {
    dayNumber: number;
    itemCount: number;
    totalItemCount: number;
    highlights: string[];
  };
  after: {
    dayNumber: number;
    itemCount: number;
    totalItemCount: number;
    highlights: string[];
  };
  itineraryDiff: Array<{
    slotId: string;
    changeType: string;
    dayNumber: number;
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  }>;
  impact: {
    feasibilityScoreBefore: number;
    feasibilityScoreAfter?: number;
    estimated: boolean;
  };
  wouldDefer?: boolean;
  guardianNegotiation?: ReadinessGuardianNegotiationSnapshot;
  /** status=would_defer 时扁平 CHOOSE 选项 */
  humanDecisionPointsFlat?: string[];
  /** would_defer 时可选单主角表达 */
  presentation?: GuardianPersonaPresentation;
  decisionPlan?: Record<string, unknown>;
  decisionLog?: Record<string, unknown>;
  option: RepairOption;
}

/**
 * 自动修复请求（选取首个高影响可本地执行的选项）
 */
export interface AutoRepairRequest {
  tripId: string;
  blockerId: string;
  executeDecision?: boolean;
  persistDecision?: boolean;
  runGuardianNegotiation?: boolean;
  forceDecisionRepair?: boolean;
}

/**
 * 刷新证据响应
 */
export interface RefreshEvidenceResponse {
  tripId: string;
  score: ReadinessScoreResponse;
  coverageSummary: CoverageSummary;
  refreshedAt: string;
}

/**
 * 坐标点
 */
export interface Coordinates {
  lat: number;
  lng: number;
}

/**
 * 地图边界
 */
export interface MapBounds {
  northeast: Coordinates;
  southwest: Coordinates;
}

/**
 * POI 覆盖状态
 */
export type PoiCoverageStatus = 'covered' | 'partial' | 'uncovered';

/**
 * 路段覆盖状态
 */
export type SegmentCoverageStatus = 'covered' | 'warning' | 'blocked';

/**
 * 证据类型
 */
export type EvidenceType = 
  | 'opening_hours'
  | 'weather'
  | 'road_closure'
  | 'booking_confirmation'
  | 'permit'
  | 'other';

/**
 * 危险/风险类型
 */
export interface SegmentHazard {
  type: string;
  severity: 'high' | 'medium' | 'low';
  message: string;
}

/**
 * POI 覆盖数据
 */
export interface PoiCoverage {
  id: string;
  itemId?: string;
  day: number;
  order: number;
  name: string;
  type: string;
  startTime?: string;
  endTime?: string;
  coordinates: Coordinates;
  coverageStatus: PoiCoverageStatus;
  evidenceCount: number;
  evidenceTypes?: EvidenceType[];
  missingEvidence?: EvidenceType[];
  metadata?: any; // 保存原始 Place.metadata 引用，用于获取证据时间戳和来源
}

/**
 * 路段覆盖数据
 */
export interface SegmentCoverage {
  id: string;
  fromPoiId: string;
  toPoiId: string;
  day: number;
  /** 全程 0-based 序号，便于 journey-map trunkSegmentIds 引用 */
  sequenceIndex?: number;
  distance: number; // km
  duration: number; // minutes
  routeType: 'driving' | 'walking' | 'transit' | 'cycling';
  coverageStatus: SegmentCoverageStatus;
  polyline: string; // Google Encoded Polyline / Mapbox polyline
  /** 几何来源：route_api=贴路，straight_line=直线回退 */
  geometrySource?: 'route_api' | 'straight_line' | 'cached_metadata';
  hazards: SegmentHazard[];
}

/**
 * 证据状态
 */
export interface EvidenceStatus {
  type: EvidenceType;
  status: 'fetched' | 'missing' | 'fetching' | 'failed';
  lastUpdated?: string;
  source?: string;
}

/**
 * 覆盖缺口
 */
export interface CoverageGap {
  id: string;
  type: 'poi' | 'segment';
  relatedId: string;
  coordinates: Coordinates;
  severity: 'high' | 'medium' | 'low';
  message: string;
  missingEvidence?: EvidenceType[];
  hazards?: string[];
  hazardType?: string; // 用于去重的危险类型
  evidenceStatus?: EvidenceStatus[]; // 证据获取状态
  affectedDays?: number[]; // 受影响的天数
  affectedPois?: string[]; // 受影响的 POI IDs
}

/**
 * 覆盖摘要
 */
export interface CoverageSummary {
  totalPois: number;
  coveredPois: number;
  partialPois: number;
  uncoveredPois: number;
  totalSegments: number;
  coveredSegments: number;
  warningSegments: number;
  blockedSegments: number;
  totalGaps: number;
  coverageRate: number; // 0-1
}

/**
 * 覆盖地图数据响应
 */
export interface CoverageMapData {
  tripId: string;
  bounds: MapBounds;
  center: Coordinates;
  zoom: number;
  pois: PoiCoverage[];
  segments: SegmentCoverage[];
  gaps: CoverageGap[];
  summary: CoverageSummary;
  // 优化后的数据
  deduplicatedWarnings?: CoverageGap[]; // 去重后的警告列表
  warningsBySeverity?: {
    high: CoverageGap[];
    medium: CoverageGap[];
    low: CoverageGap[];
  };
  evidenceStatusSummary?: {
    total: number;
    fetched: number;
    missing: number;
    fetching: number;
    failed: number;
  };
  calculatedAt: string; // 计算时间戳
  dataFreshness?: {
    weather?: string; // 天气数据最后更新时间
    roadClosure?: string; // 道路封闭数据最后更新时间
    openingHours?: string; // 开放时间数据最后更新时间
    inventory?: string; // 住宿库存/预订确认最后更新时间
  };
  /** 规划期 vs 临行前：控制路况类缺口是否展示 */
  readinessPhase?: 'planning' | 'pre_departure' | 'in_trip' | 'past';
  daysUntilStart?: number;
  phaseHint?: string;
  deferredLiveGapCount?: number;
  /** 生效的单段距离阈值（用户 > 国家 > 全球） */
  segmentDistanceThresholds?: ResolvedSegmentDistanceThresholds;
}
