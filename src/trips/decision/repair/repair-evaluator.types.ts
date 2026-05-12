/**
 * RepairEvaluator 输入：与 unified temporal + 信号对齐，避免引入全表 replan 依赖。
 */

import type { TripPlan } from '../plan-model';
import type { TimeDrift } from '../temporal/time-drift.types';
import type { UnifiedConstraintGraphSnapshot } from '../constraint-graph/unified-constraint-graph.types';
import type { DaylightFeasibilitySignalSummary } from '../temporal/temporal-propagation.types';
import type { NightObservationFeasibilitySignalSummary } from '../signals/aurora-night-signals.types';
import type { TripWorldState } from '../world-model';
import type { OpportunityMigrationEvaluation } from '../opportunity/opportunity-migration.types';
import type { OvernightRestructuringPressure } from '../restructuring/overnight-restructuring.types';
import type { LegTemporalSafetyAssessment } from '../temporal/leg-temporal-safety.types';
import type { ExecutionOverlayFrame } from '../../execution-overlay/execution-overlay-frame.types';
import type { ExecutionTruthDAG } from '../../execution-truth-dag/execution-truth-dag.types';
import type { ExecutionIR } from '../../execution-ir/execution-ir.types';
import type { FuelReachabilitySummary } from '../../fuel/fuel-reachability.types';
import type { PhysicsFieldIndex } from '../../physics/unified-physics-field-index.types';

export interface RepairEvaluatorInput {
  plan: TripPlan;
  timeDrifts: TimeDrift[];
  /** 可选：统一约束图（后续 Booking 边将在此体现） */
  unifiedConstraintGraph?: UnifiedConstraintGraphSnapshot;
  /** 民用暮光违规摘要（与 signals.daylightFeasibility 同源） */
  daylightFeasibility?: DaylightFeasibilitySignalSummary;
  /** 极光/夜间户外观测不可行槽位摘要（与 signals.nightObservationFeasibility 同源） */
  nightObservationFeasibility?: NightObservationFeasibilitySignalSummary;
  /** 世界策略：压缩上界、营运窗等 */
  policies?: TripWorldState['policies'];
  /**
   * 单日最坏执行质量（可由引擎注入 plan.metrics 或单日 weatherExecution）
   * 用于判断是否值得触发压缩类修复。
   */
  worstDayExecution?: {
    safeScore?: number;
    delayFactor?: number;
    date?: string;
  };
  /** 与 `signals.opportunityMigrationEvaluations` 同源，用于 SWAP_POI 挂载经济学闸门 */
  opportunityMigrationEvaluations?: OpportunityMigrationEvaluation[];
  /** 与 `signals.overnightRestructuringPressures` 同源 → 提案候选 */
  overnightRestructuringPressures?: OvernightRestructuringPressure[];
  /** 与 `signals.legTemporalSafetyAssessments` 同源（细分 MARGINAL / margin） */
  legTemporalSafetyAssessments?: LegTemporalSafetyAssessment[];
  /**
   * P5-1：非空时为单一执行读契约 — daylight / delay / cross-day 仅从 frame.temporal 与根级 unifiedDelayMinutes；
   * 不再并行跑 daylightFeasibility、weatherExecution SEQUENCE、裸 drift、booking/aurora 独立决策枝。
   * （无帧时仍走遗留 collectors，直至管线全量产出 overlay。）
   */
  executionOverlayFrames?: ExecutionOverlayFrame[];
  /** When set with overlay frames — Repair emits {@link RepairEvaluationResult.dagPatches} (P8-2-B). */
  executionTruthDAG?: ExecutionTruthDAG;
  /** P8-2-B：仅来自 `compileDAGToIR`（`DAG_COMPILER`）；`repairIROnlyLock` 时必须提供并与 witness 对齐。 */
  executionIR?: ExecutionIR;
  /** P-FUEL-1：与 `signals.fuelReachabilityByLegId` 同源（IR 模式下亦可显式传入）。 */
  fuelReachabilityByLegId?: Partial<Record<string, FuelReachabilitySummary>>;
  /** P-Next 3：与 `evaluateMinimalRepairs` 同时注入，用于 `overlayExplanationOnly` 分支。 */
  physicsFieldIndex?: PhysicsFieldIndex;
}
