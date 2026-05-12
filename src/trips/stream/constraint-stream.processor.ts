/**
 * Constraint Stream Processor — 流归一化 → 状态库 → 增量 diff →（可选）局部重规划语义增量 + 自愈控制器
 */

import type { TripPlan } from '../decision/plan-model';
import type { SemanticDeltaEvent } from '../decision/execution/semantic-delta-event.types';
import type { ExecutionSemanticRuntime } from '../decision/execution/unified-execution-semantic-view';
import type { HealingRuntimeSnapshot } from '../healing/healing.types';
import {
  SelfHealingController,
  type SelfHealingIngestResult,
} from '../healing/self-healing.controller';
import { extractImpactSubgraph } from '../replan/impact-subgraph.extractor';
import {
  executePartialReplan,
  type PartialReplanResult,
} from '../replan/partial-replan.executor';
import { buildPartialReplanGraphFromPlan } from '../replan/build-partial-replan-graph';
import { computeConstraintDiff } from './constraint-diff.engine';
import type { ConstraintStateStore } from './constraint-state.store';
import type {
  ConstraintDiff,
  NormalizedConstraintEvent,
  RawConstraintEvent,
} from './constraint-stream.types';

export interface ProcessConstraintStreamOptions {
  readonly tripPlan?: TripPlan;
  readonly selfHealingController?: SelfHealingController;
}

export interface ProcessConstraintStreamResult {
  readonly normalized: NormalizedConstraintEvent;
  readonly diff: ConstraintDiff;
  /** 当 diff 需要重算且提供 tripPlan 时生成（可与 reducer / emitter 对接） */
  readonly streamingReplanDelta?: SemanticDeltaEvent;
  readonly partialReplan?: PartialReplanResult;
  readonly healingState?: SelfHealingIngestResult;
  readonly selfHealingDelta?: SemanticDeltaEvent;
}

export function stableNormalizedEventId(raw: RawConstraintEvent): string {
  switch (raw.kind) {
    case 'ROAD':
      return `road:${raw.roadId}:${raw.at}:${raw.status}`;
    case 'WEATHER':
      return `wx:${raw.at}:${raw.affectedSlotIds.slice().sort().join(',')}`;
    case 'BOOKING':
      return `book:${raw.slotId}:${raw.at}:${raw.bookingStatus}`;
    default: {
      const _exhaustive: never = raw;
      return _exhaustive;
    }
  }
}

export function normalizeConstraintEvent(
  raw: RawConstraintEvent,
): NormalizedConstraintEvent {
  switch (raw.kind) {
    case 'ROAD':
      return {
        id: stableNormalizedEventId(raw),
        at: raw.at,
        domain: 'ROAD',
        severity: raw.severity,
        affectedSlotIds: [...(raw.affectedSlotIds ?? [])],
        roads: [{ roadId: raw.roadId, status: raw.status }],
      };
    case 'WEATHER':
      return {
        id: stableNormalizedEventId(raw),
        at: raw.at,
        domain: 'WEATHER',
        severity: raw.severity,
        affectedSlotIds: [...raw.affectedSlotIds],
        weatherDate: raw.date,
      };
    case 'BOOKING':
      return {
        id: stableNormalizedEventId(raw),
        at: raw.at,
        domain: 'BOOKING',
        severity: raw.severity,
        affectedSlotIds: [raw.slotId],
        booking: {
          slotId: raw.slotId,
          bookingStatus: raw.bookingStatus,
        },
      };
    default: {
      const _exhaustive: never = raw;
      return _exhaustive;
    }
  }
}

function buildSelfHealingSemanticDelta(
  h: SelfHealingIngestResult,
): SemanticDeltaEvent {
  return {
    kind: 'SELF_HEALING_STATE',
    payload: {
      status: h.status,
      iteration: h.iteration,
      remainingIssues: h.remainingIssues,
      stabilityScore: h.stabilityScore,
      shouldPauseStream: h.shouldPauseStream,
    },
    impact: {
      affectedDomains: ['CONSTRAINT_FUSION'],
      impactScope: 'GLOBAL',
    },
  };
}

/** 供 `buildTripExecutionSemanticViewSnapshot({ healingSnapshot })` 注入 */
export function healingSnapshotFromIngest(
  h: SelfHealingIngestResult,
): HealingRuntimeSnapshot {
  return {
    status: h.status,
    iteration: h.iteration,
    remainingIssues: h.remainingIssues,
    stabilityScore: h.stabilityScore,
  };
}

/**
 * 将约束流处理结果叠加到 ExecutionSemanticView.runtime（供 builder / reducer 注入）
 */
export function buildExecutionSemanticRuntimeFromStream(
  lastUpdatedAt: number,
  diff: ConstraintDiff,
): ExecutionSemanticRuntime {
  return {
    lastUpdatedAt,
    source: 'STREAM',
    lastStreamSeverity: diff.severity,
  };
}

/**
 * 处理单条原始约束事件：写入 ConstraintStateStore，计算增量 diff；可选自愈控制器与局部重规划语义增量。
 */
export function processConstraintStream(
  store: ConstraintStateStore,
  raw: RawConstraintEvent,
  options?: ProcessConstraintStreamOptions,
): ProcessConstraintStreamResult {
  const normalized = normalizeConstraintEvent(raw);
  const diff = computeConstraintDiff(store, normalized);

  let healingState: SelfHealingIngestResult | undefined;
  let selfHealingDelta: SemanticDeltaEvent | undefined;

  if (options?.selfHealingController) {
    healingState = options.selfHealingController.ingest(diff, normalized.at);
    selfHealingDelta = buildSelfHealingSemanticDelta(healingState);
  }

  const base: ProcessConstraintStreamResult = {
    normalized,
    diff,
    ...(healingState !== undefined ? { healingState } : {}),
    ...(selfHealingDelta !== undefined ? { selfHealingDelta } : {}),
  };

  if (!diff.requiresReplan || !options?.tripPlan) {
    return base;
  }

  const graph = buildPartialReplanGraphFromPlan(options.tripPlan);
  const subgraph = extractImpactSubgraph(graph, [...diff.changedSlots]);
  const partialReplan = executePartialReplan(subgraph, options.tripPlan);

  const streamingReplanDelta: SemanticDeltaEvent = {
    kind: 'STREAMING_REPLAN',
    payload: {
      planDiff: partialReplan.diff,
      constraintDiff: {
        changedSlots: [...diff.changedSlots],
        severity: diff.severity,
        requiresReplan: diff.requiresReplan,
      },
      normalizedEventId: normalized.id,
    },
    impact: {
      affectedDomains: ['CONSTRAINT_FUSION'],
      impactScope: 'GLOBAL',
    },
  };

  return {
    ...base,
    streamingReplanDelta,
    partialReplan,
  };
}
