// src/trips/decision/evaluation/e2e-case.types.ts
/**
 * E2E Case Schema
 * 
 * 用于 E2E 回放与评测的测试用例定义
 */

import { DecisionLogEntry } from '../shared/decision-result.types';
import type {
  CandidateSearchAudit,
  CandidateSearchBudget,
} from '../../../decision/kernel/decision-state.types';
import type { DecisionStage } from '../shared/decision-result.types';

/**
 * 用户画像（简化版）
 */
export interface UserProfile {
  pacePreference?: 'SLOW' | 'MEDIUM' | 'FAST';
  altitudeTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
  travelPhilosophy?: string;
  preferredRouteTypes?: string[];
}

/**
 * E2E Case 输入
 */
export interface E2ECaseInput {
  userProfile: UserProfile;
  season: number; // 月份（1-12）
  countryCode: string;
  userQuery: string;
  /** 可选：Prisma `Trip.id`，回放时写入 `TripWorldState` 以对齐 ECO 账本 / `ecoLedgerTripId`。 */
  tripId?: string;
}

/**
 * Abu 预期行为
 */
export interface AbuExpected {
  action: 'ALLOW' | 'REJECT';
  reasonCodes?: string[]; // 必须包含的 reason codes
  violations?: string[]; // 必须检测到的违规
}

/**
 * Dr.Dre 预期行为
 */
export interface DrDreExpected {
  mustAdjust: boolean; // 是否必须调整
  adjustmentTypes?: ('SPLIT_DAY' | 'BUFFER_DAY' | 'ADJUST_PACE')[];
}

/**
 * Neptune 预期行为
 */
export interface NeptuneExpected {
  mustRepair: boolean; // 是否必须修复
  replacementTypes?: ('ENTRY' | 'POI' | 'SEGMENT')[];
}

/**
 * 最终状态预期
 */
export interface FinalStateExpected {
  allowed: boolean;
  planDays?: number; // 预期天数
}

export type DecisionTraceSchemaVersion = 'trace/v1';

export interface DecisionTraceSummary {
  schemaVersion: DecisionTraceSchemaVersion;
  metaDecisionAudit?: string;
  candidateSearchBudget?: CandidateSearchBudget;
  candidateSearchAudit?: CandidateSearchAudit;
}

export type ExpectedDecisionTraceSummary = {
  schemaVersion: DecisionTraceSchemaVersion;
} & Partial<Omit<DecisionTraceSummary, 'schemaVersion'>>;

export interface StructuredDiffItem<TKey = string> {
  key: TKey;
  expected: unknown;
  actual: unknown;
  message: string;
}

export interface ScientificOptimizationExpected {
  mustEmitTrace?: boolean;
  minCandidateSearchIterations?: number;
  minFinalFeasibleCount?: number;
  allowedStopReasons?: CandidateSearchAudit['stopReason'][];
  metaDecisionAuditIncludes?: string[];
}

export interface ScientificReplayExpected {
  optimization?: ScientificOptimizationExpected;
}

export interface ReplayTimelineExpected {
  requiredStages?: DecisionStage[];
  forbiddenStages?: DecisionStage[];
  orderedStages?: DecisionStage[];
}

/**
 * E2E Case 预期行为
 */
export interface E2ECaseExpected {
  routeDirectionId?: string;
  routeDirectionTags?: string[];
  abuExpected: AbuExpected;
  drdreExpected?: DrDreExpected;
  neptuneExpected?: NeptuneExpected;
  finalState: FinalStateExpected;
  traceSummary?: ExpectedDecisionTraceSummary;
  scientificExpected?: ScientificReplayExpected;
  timelineExpected?: ReplayTimelineExpected;
}

/**
 * E2E Case 元数据
 */
export interface E2ECaseMetadata {
  tags?: string[];
  priority?: 'P0' | 'P1' | 'P2';
  source?: string; // 来源（如 'iceland-highlands'）
  description?: string;
  fixtureKind?: 'synthetic' | 'golden';
  /**
   * Optional minimal DSO snapshot captured for CGUS/optimization offline analysis.
   *
   * Intended use:
   * - allow "real fixture" CGUS replay without booting the full agent pipeline
   * - keep winner-protected MC rerank metrics comparable across suites
   *
   * Shape: DecisionState-like object (at minimum environmentState + tripState.planDraft + constraints.violations).
   */
  cgusDsoSnapshot?: unknown;
  /** Human-readable note about how the snapshot was produced (captured vs derived). */
  cgusDsoSnapshotNote?: string;
  /** Generated fixture format version for engine-captured snapshots. */
  cgusDsoFixtureVersion?: 'engine-dso-v1';
  /** When the engine snapshot fixture was generated. */
  cgusDsoGeneratedAt?: string;
  /** Which base case produced this generated fixture. */
  cgusDsoSourceCaseId?: string;
  counterfactualGroup?: string;
  baselineCaseId?: string;
  counterfactualExpectation?: {
    expectedOutcomeShift?: 'ADD_ADJUST' | 'ADD_REPAIR' | 'ADD_ADJUST_AND_REPAIR' | 'REJECT';
    minCandidateBudgetDelta?: number;
    minRepairMaxItersDelta?: number;
    requiredAdditionalStages?: DecisionStage[];
  };
}

/**
 * E2E Case 完整定义
 */
export interface E2ECase {
  id: string;
  name: string;
  description: string;
  input: E2ECaseInput;
  expected: E2ECaseExpected;
  metadata?: E2ECaseMetadata;
}

/**
 * 实际执行结果
 */
export interface E2EActualResult {
  routeDirectionId?: string;
  logs: DecisionLogEntry[];
  /** Decision engine run log (includes optional CGUS DSO snapshot). */
  decisionRunLog?: unknown;
  finalPlan?: {
    days: number;
    allowed: boolean;
  };
  traceSummary?: DecisionTraceSummary;
}

/**
 * 差异分析结果
 */
export interface E2EDiff {
  abuDiff?: string[]; // Abu 行为差异
  drdreDiff?: string[]; // Dr.Dre 行为差异
  neptuneDiff?: string[]; // Neptune 行为差异
  routeDirectionDiff?: string; // RouteDirection 选择差异
  finalStateDiff?: string; // 最终状态差异
  traceDiff?: Array<StructuredDiffItem<keyof DecisionTraceSummary>>; // 关键 trace / metadata 差异
  scientificDiff?: string[];
  timelineDiff?: string[];
  hasDiff: boolean; // 是否有差异
}

/**
 * E2E Replay 结果
 */
export interface E2EReplayResult {
  case: E2ECase;
  actual: E2EActualResult;
  diff: E2EDiff;
  passed: boolean; // 是否通过
  executionTime?: number; // 执行时间（毫秒）
}
