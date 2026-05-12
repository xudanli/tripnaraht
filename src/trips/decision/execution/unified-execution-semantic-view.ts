/**
 * Layer A — Single Execution Truth（决策侧唯一解释层）
 *
 * 将引擎已合并的 `weatherByDate` 等压平为按日的决策视图；不包含原始 API 响应。
 * 决策模块（Checker / Neptune / Utility）应优先读此对象，而非分散读 physical / condition。
 */

import type { ISODate } from '../world-model';
import {
  weatherExecutionDayStress,
  type WeatherExecutionDayStressResult,
  type WeatherExecutionSignal,
} from './weather-execution-semantic-adapter';
import type { TemporalPropagationSignalSummary } from '../temporal/temporal-propagation.types';
import type { SlotConstraintFusionTraceV0 } from '../../constraints/fusion-trace.types';
import type { SlotRepairPlan } from '../../repair/slot-repair.types';
import type { SemanticImpactTraceV0 } from './semantic-impact.types';
import type { ExecutionSemanticCounterfactualOverlay } from '../../counterfactual/counterfactual.model';
import type { Explanation } from '../../explain/explanation.synthesizer';
import type { HealingRuntimeSnapshot } from '../../healing/healing.types';
import type { IntentReconciliationOverlay } from '../../reconciliation/reconciliation.model';
import type { ItineraryNarrative } from '../../narrative/narrative.model';
import type { ExecutionSemanticWorldOverlay } from '../../../world/execution-semantic-world.types';
import type { AuroraOpportunitySignal } from '../signals/aurora-opportunity-signals.types';

export type NeptuneWeatherTier = 'HARD' | 'SOFT' | 'NONE';

/** 执行语义视图演化模式（全量快照 vs 约束流持续更新） */
export interface ExecutionSemanticRuntime {
  readonly lastUpdatedAt: number;
  readonly source: 'STREAM' | 'FULL_REBUILD';
  /** 最后一次约束流 diff 严重度（Neptune 0f） */
  readonly lastStreamSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface DayExecutionSemanticView {
  date: ISODate;
  weather: WeatherExecutionSignal;
  /** 不含 critical alerts（与 weatherExecutionDayStress 一致） */
  outdoorWeatherStress: WeatherExecutionDayStressResult;
  /** Neptune / 空间策略分层 */
  neptuneWeatherTier: NeptuneWeatherTier;
  /** 夜间极光/观测机会域（与 weather 正交；缺省表示未建模或未接入） */
  auroraOpportunity?: AuroraOpportunitySignal;
}

/** 语义快照覆盖的日历区间 + 解释时钟（跨日一致性 / 回放） */
export interface ExecutionSemanticTemporalScope {
  /** 与本快照 `emittedAt` 对齐的解释时刻 */
  asOf: string;
  /** 本快照声称覆盖的行程日历闭区间（通常来自 plan.days） */
  horizon: { start: ISODate; end: ISODate };
}

/** ROAD_CONSTRAINT_UPDATE / ROAD_CONSTRAINT_CHANGE 写入的运行时轨迹（Neptune / Repair） */
export interface RoadConstraintRuntimeTraceV0 {
  readonly roadImpactSeverity: 'LOW' | 'MEDIUM' | 'HIGH';
  readonly requiresReplan: boolean;
  readonly affectedPoiIds?: readonly string[];
  readonly tripAffectedDays?: readonly string[];
  readonly tripAffectedSlotIds?: readonly string[];
  readonly tripImpactSeverity?: 'LOW' | 'MEDIUM' | 'HIGH';
}

/** Slot Repair Engine → Neptune / 自动改写 */
export interface SlotRepairRuntimeTraceV0 {
  readonly repairs: readonly SlotRepairPlan[];
}

/** PARTIAL_REPLAN_EXECUTED → Neptune 校验 */
export interface PartialReplanRuntimeTraceV0 {
  readonly changedSlotIds: readonly string[];
  readonly boundarySlotIds: readonly string[];
  readonly subgraphNodeIds: readonly string[];
}

/** fingerprint 链：解释「为何相对上一版发生变化」 */
export interface SemanticViewLineage {
  parentFingerprint?: string;
  revision: number;
  lastEventId?: string;
  /** 如 `ENGINE_FULL_REBUILD`、`SEMANTIC_DELTA` */
  lastEventKind?: string;
  /** `SEMANTIC_DELTA` 时记录 `SemanticDeltaKind`（因果扩展预留） */
  lastSemanticDeltaKind?: string;
  /** `SEMANTIC_DELTA` 时记录影响声明 + 推导的陈旧切片 */
  lastSemanticImpactTrace?: SemanticImpactTraceV0;
  /** 物理路网约束 → 行程影响摘要（Trip Impact Resolver） */
  roadConstraintRuntimeTrace?: RoadConstraintRuntimeTraceV0;
  /** 多域融合槽位阻断轨迹（Constraint Fusion Layer） */
  slotConstraintFusionTrace?: SlotConstraintFusionTraceV0;
  /** 槽位级修复建议（Repair Engine） */
  slotRepairTrace?: SlotRepairRuntimeTraceV0;
  /** 局部重规划执行轨迹（Partial Replan Runtime） */
  partialReplanTrace?: PartialReplanRuntimeTraceV0;
}

/** 由唯一构建入口写入，用于治理 / 回放 / diff（inputsFingerprint 为确定性摘要） */
export interface SemanticViewAuthority {
  builderId: string;
  schemaVersion: '1';
  builderSemver: string;
  inputsFingerprint: string;
  lineage?: SemanticViewLineage;
}

export interface UnifiedExecutionSemanticView {
  version: '1';
  emittedAt: string;
  byDate: Partial<Record<ISODate, DayExecutionSemanticView>>;
  /** 时间语义：当前 pass 对应的日历切片（非气象预报时间轴） */
  temporalScope?: ExecutionSemanticTemporalScope;
  /** 与 `signals.temporalPropagation` 同源摘要指针（单一引用，避免重复真相） */
  temporalPropagationSummary?: TemporalPropagationSignalSummary;
  /**
   * 系统级 critical 告警副本（不参与 outdoorWeatherStress；供叙述/审计）
   */
  globalCriticalAlerts?: ReadonlyArray<{
    code: string;
    severity: string;
    message: string;
  }>;
  /** 生产路径由 `trip-execution-semantic-view.builder` 注入 */
  authority?: SemanticViewAuthority;
  /**
   * 连续运行时元数据（约束流 / 全量重建）；与 `emittedAt` 互补 — `lastUpdatedAt` 为 epoch ms。
   */
  runtime?: ExecutionSemanticRuntime;
  /** 自愈闭环快照（Self-Healing Runtime；可与 lineage SELF_HEALING_STATE 对齐） */
  healing?: HealingRuntimeSnapshot;
  /** 因果解释（Causal Explanation Layer；不参与 fingerprint digest） */
  explanation?: Explanation;
  /** 反事实分支摘要（Counterfactual Layer；不参与 fingerprint digest） */
  counterfactual?: ExecutionSemanticCounterfactualOverlay;
  /** 意图–现实对齐摘要（Intent–Reality Layer；不参与 fingerprint digest） */
  intentReconciliation?: IntentReconciliationOverlay;
  /** 叙事化行程（Narrative Layer；不参与 fingerprint digest） */
  narrative?: ItineraryNarrative;
  /** 单一世界约束 SSOT 快照 + 最后一次统一 diff（World Constraint Runtime） */
  world?: ExecutionSemanticWorldOverlay;
}

function inferNeptuneWeatherTier(
  w: WeatherExecutionSignal | undefined,
): NeptuneWeatherTier {
  if (!w) {
    return 'NONE';
  }
  if (w.violation === 'HARD' || w.executionState === 'BLOCKED') {
    return 'HARD';
  }
  if (
    w.violation === 'SOFT' ||
    w.executionState === 'HIGH_RISK' ||
    w.executionState === 'DEGRADED'
  ) {
    return 'SOFT';
  }
  return 'NONE';
}

/** 由 plan 日历日推导 horizon（单调字符串排序） */
export function computeExecutionSemanticHorizon(
  planDates: readonly ISODate[] | undefined,
): { start: ISODate; end: ISODate } | undefined {
  const d = [...(planDates ?? [])].filter(Boolean).sort();
  if (d.length === 0) {
    return undefined;
  }
  return { start: d[0]!, end: d[d.length - 1]! };
}

export interface BuildUnifiedExecutionSemanticViewInput {
  weatherByDate?: Partial<Record<ISODate, WeatherExecutionSignal>>;
  /** 夜间极光机会域（与 weatherByDate 独立接入 Layer A） */
  auroraOpportunityByDate?: Partial<Record<ISODate, AuroraOpportunitySignal>>;
  /** 行程日历日：为缺失日补中性壳，保证 Checker/Neptune 可按日索引（强制 runtime 契约） */
  planDates?: readonly ISODate[];
  temporalPropagationSummary?: TemporalPropagationSignalSummary;
  alerts?: ReadonlyArray<{
    code: string;
    severity: 'info' | 'warn' | 'critical';
    message: string;
  }>;
  /**
   * 约束流运行时叠加（不参与 deterministic fingerprint 核心摘要时可在外层单独注入）。
   */
  executionRuntime?: ExecutionSemanticRuntime;
  /** 自愈状态叠加（不参与 fingerprint  digest，见 builder） */
  healingSnapshot?: HealingRuntimeSnapshot;
  /** 因果解释叠加（不参与 fingerprint digest） */
  explanation?: Explanation;
  /** 反事实叠加（不参与 fingerprint digest） */
  counterfactualOverlay?: ExecutionSemanticCounterfactualOverlay;
  /** 意图–现实对齐叠加（不参与 fingerprint digest） */
  intentReconciliationOverlay?: IntentReconciliationOverlay;
  /** 叙事行程叠加（不参与 fingerprint digest） */
  narrativeOverlay?: ItineraryNarrative;
  /** 世界约束 SSOT 叠加（不参与 fingerprint digest） */
  worldOverlay?: ExecutionSemanticWorldOverlay;
}

/**
 * 核心物化（无 `authority`）。生产写入请使用 `trip-execution-semantic-view.builder`。
 */
export function buildUnifiedExecutionSemanticView(
  input: BuildUnifiedExecutionSemanticViewInput,
): UnifiedExecutionSemanticView {
  const emittedAt = new Date().toISOString();
  const wx = input.weatherByDate ?? {};
  const byDate: Partial<Record<ISODate, DayExecutionSemanticView>> = {};

  for (const date of Object.keys(wx)) {
    const weather = wx[date];
    if (!weather) {
      continue;
    }
    const outdoorWeatherStress = weatherExecutionDayStress({
      signal: weather,
      hasCriticalAlerts: false,
    });
    byDate[date] = {
      date,
      weather,
      outdoorWeatherStress,
      neptuneWeatherTier: inferNeptuneWeatherTier(weather),
    };
  }

  const planDates = input.planDates ?? [];
  for (const date of planDates) {
    if (byDate[date]) {
      continue;
    }
    const weather: WeatherExecutionSignal = {};
    byDate[date] = {
      date,
      weather,
      outdoorWeatherStress: weatherExecutionDayStress({
        signal: weather,
        hasCriticalAlerts: false,
      }),
      neptuneWeatherTier: 'NONE',
    };
  }

  const critical = (input.alerts ?? []).filter(a => a.severity === 'critical');

  const opp = input.auroraOpportunityByDate ?? {};
  for (const date of Object.keys(opp)) {
    const auroraOpportunity = opp[date];
    if (!auroraOpportunity) {
      continue;
    }
    const existing = byDate[date];
    if (existing) {
      byDate[date] = { ...existing, auroraOpportunity };
    } else {
      const weather: WeatherExecutionSignal = {};
      byDate[date] = {
        date,
        weather,
        outdoorWeatherStress: weatherExecutionDayStress({
          signal: weather,
          hasCriticalAlerts: false,
        }),
        neptuneWeatherTier: 'NONE',
        auroraOpportunity,
      };
    }
  }

  return {
    version: '1',
    emittedAt,
    byDate,
    temporalPropagationSummary: input.temporalPropagationSummary,
    globalCriticalAlerts:
      critical.length > 0
        ? critical.map(a => ({
            code: a.code,
            severity: a.severity,
            message: a.message,
          }))
        : undefined,
    ...(input.executionRuntime !== undefined
      ? { runtime: input.executionRuntime }
      : {}),
    ...(input.healingSnapshot !== undefined
      ? { healing: input.healingSnapshot }
      : {}),
    ...(input.explanation !== undefined ? { explanation: input.explanation } : {}),
    ...(input.counterfactualOverlay !== undefined
      ? { counterfactual: input.counterfactualOverlay }
      : {}),
    ...(input.intentReconciliationOverlay !== undefined
      ? { intentReconciliation: input.intentReconciliationOverlay }
      : {}),
    ...(input.narrativeOverlay !== undefined
      ? { narrative: input.narrativeOverlay }
      : {}),
    ...(input.worldOverlay !== undefined ? { world: input.worldOverlay } : {}),
  };
}
