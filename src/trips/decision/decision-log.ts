// src/trips/decision/decision-log.ts

/**
 * Decision Log - "自我纠偏"的证据链
 * 
 * 每次计划生成/修复都可审计、可回放、可学习
 */

import { ISODatetime, ISODate } from './world-model';
import type { EcoOrchestrationDigest } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import { DecisionPersona, DecisionAction } from './shared/decision-result.types';
import { ConstraintConflict } from './constraints/constraint-dsl.types';

export type DecisionTrigger =
  | 'initial_generate'
  | 'user_edit'
  | 'signal_update'        // weather / alerts update
  | 'availability_update'  // opening hours / inventory change
  | 'time_overrun'
  | 'budget_overrun'
  | 'manual_repair';

export interface ConstraintViolation {
  code: string;                 // e.g., 'CLOSED', 'WEATHER_UNSAFE', 'TIME_WINDOW_MISS'
  date?: ISODate;
  slotId?: string;
  details?: Record<string, any>;
}

export interface PlanDiffSummary {
  changedSlots: number;
  movedSlots: number;
  removedSlots: number;
  addedSlots: number;
  // min-edit style: quantify "改动幅度"
  editDistanceScore: number; // smaller = less change
}

export interface DecisionRunLog {
  runId: string;
  at: ISODatetime;
  trigger: DecisionTrigger;

  plannerVersion: string;
  strategyMix: Array<'abu' | 'drdre' | 'neptune'>;

  // key inputs snapshot (keep small, store full snapshot in DB if needed)
  inputDigest: {
    tripId?: string;
    destination: string;
    startDate: ISODate;
    durationDays: number;
    signalUpdatedAt: ISODatetime;
  };

  violations?: ConstraintViolation[];
  chosenActions: Array<{
    actionType: 'prioritize' | 'drop' | 'swap' | 'reorder' | 'insert_buffer' | 'shorten';
    reasonCodes: string[];
    payload: Record<string, any>;
  }>;

  predictedImpact?: {
    costChange?: number;
    activeMinutesChange?: number;
    travelMinutesChange?: number;
    robustnessChange?: number;
  };

  diff?: PlanDiffSummary;

  // optional: store old/new plan refs
  planBeforeRef?: string;
  planAfterRef?: string;

  // quick explain to UI
  explanation?: string;

  /** P-Next ECO：Neptune 之后的 P7–P10 编排摘要（若本 tick 启用）。 */
  ecoOrchestration?: EcoOrchestrationDigest;

  // PART 3: 三人格策略日志（用于前端展示）
  strategyLogs?: Array<{
    persona: DecisionPersona;
    action: DecisionAction;
    explanation: string;
    reasonCodes: string[];
    timestamp: string;
  }>;

  // RouteDirection 解释（为什么选择这个路线方向）
  routeDirectionExplanation?: string;

  // RouteDirection selection info (for E2E testing and observability)
  routeDirection?: {
    selected: {
      id: number;
      uuid?: string;
      name?: string;
      nameCN?: string;
    };
    scoreBreakdown?: {
      tagMatch?: {
        score: number;
        matchedTags?: string[];
      };
      seasonMatch?: {
        score: number;
        month?: number;
        bestMonths?: number[];
      };
      paceMatch?: {
        score: number;
        userPace?: string;
        routePace?: string;
      };
      riskMatch?: {
        score: number;
        userRiskTolerance?: string;
        routeRiskLevel?: string;
      };
      totalScore?: number;
    };
    constraints?: Record<string, any>;
    matchedSignals?: Record<string, any>;
  };

  // P1.1.4: 路线规划的证据链（用于解释"为什么这样排"）
  evidenceChain?: {
    planEvidence?: {
      whyThisRoute?: string[];
      whyThisItinerary?: string[];
      segmentationEvidence?: {
        totalDistance: number;
        totalAscent: number;
        steepSections: number;
        energyBreakpoints: number;
        mandatoryRestPoints: number;
      };
      riskEvidence?: {
        consecutiveHighAltitudeDays: number;
        consecutiveAscent: number;
        steepConcentratedSections: number;
        totalRiskScore: number;
      };
    };
    dailyEvidences?: Array<{
      date: string;
      day: number;
      slotEvidences?: Array<{
        slotId: string;
        activityName: string;
        evidence?: Array<{
          type: string;
          title: string;
          description: string;
          data?: Record<string, any>;
          severity?: string;
          impactsDecision: boolean;
          decisionImpact?: string;
        }>;
        whySelected?: string[];
        whyThisTime?: string[];
        whyThisLocation?: string[];
      }>;
      whyThisDay?: string[];
      terrainEvidence?: {
        maxElevation: number;
        totalAscent: number;
        steepSections?: number;
        mandatoryRestPoints?: number;
        energyBreakpoints?: number;
      };
      energyEvidence?: {
        totalEnergyCost: number;
        maxEnergyBudget: number;
        energyRatio: number;
        exceeded?: boolean;
      };
      riskEvidence?: {
        riskScore: number;
        riskFlags?: Array<{ type: string; severity: string; message: string }>;
      };
    }>;
  };

  // PART 2: DEM Decision Evidence（强制检查结果）
  demEvidence?: {
    segmentEvidences?: Array<{
      segmentId: string;
      violation: 'HARD' | 'SOFT' | 'NONE';
      explanation: string;
    }>;
    hasHardViolation?: boolean;
    hasSoftViolation?: boolean;
    rollingFatigue?: {
      detected: boolean;
      startDay?: number;
      endDay?: number;
      suggestedAction?: string;
      explanation?: string;
    };
    canProceed?: boolean;
  };

  // Dry-run 结果
  dryRunResult?: {
    willFail?: boolean;
    failureDay?: number;
    failureReason?: string;
    recommendations?: string[];
  };

  // 约束冲突检测结果
  conflicts?: ConstraintConflict[];

  /**
   * Optional minimal DSO snapshot for offline CGUS/optimization replay.
   *
   * This is intentionally a "minimum viable" DecisionState-like object:
   * - environmentState + tripState.planDraft + constraints.violations
   *
   * It allows downstream replay tooling to evaluate ranking strategies without
   * booting the full agent pipeline or reconstructing hidden engine state.
   */
  cgusDsoSnapshot?: unknown;
  cgusDsoSnapshotNote?: string;

  /** P-OPS-3：本 tick 营运策略治理快照（审计）。 */
  opsOperationalGovernance?: import('./operational-policy/operational-policy.types').OpsOperationalGovernanceSnapshot;

  /**
   * Reality Kernel — shadow snapshot root reference（`REALITY_SNAPSHOT_SHADOW` 开启时写入）。
   * 决策仍走 legacy 路径；此字段供回放 / diff / 与 OPS 行 join。
   */
  realityKernelShadow?: {
    snapshot_id: string;
    schema: string;
    degraded: boolean;
    max_staleness_sec: number;
    valid_at: string;
    generated_at: string;
  };

  /**
   * Phase 3：`REALITY_ENFORCEMENT=1` 时写入 —— 本 tick 决策绑定的官方快照引用（与 `DecisionContextV0` 同源）。
   */
  snapshotBoundDecision?: {
    schema: string;
    snapshot_id: string;
    planning_horizon: { start_at: string; end_at: string };
    enforcement: 'bound_v0';
    consistency_degraded: boolean;
  };

  /** Phase 0: 约束引擎拒绝（硬约束违规，方案淘汰） */
  constraintEngineRejection?: {
    infeasibilityExplanation?: {
      feasible: boolean;
      reasons: Array<{
        constraint: string;
        description: string;
        fix_suggestions: string[];
      }>;
      summary?: string;
    };
    violations?: Array<{ code: string; severity: string; message: string }>;
  };
}

