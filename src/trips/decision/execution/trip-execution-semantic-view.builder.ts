/**
 * Trip 决策引擎 — executionSemanticView **唯一合法构建入口**（Runtime Governance）
 *
 * 禁止在业务模块中直接调用 `buildUnifiedExecutionSemanticView`（保留给单测与内部实现）。
 * 所有写入 `TripWorldState.signals.executionSemanticView` 的路径须经过本 builder。
 */

import { createHash } from 'node:crypto';
import {
  buildUnifiedExecutionSemanticView,
  computeExecutionSemanticHorizon,
  type BuildUnifiedExecutionSemanticViewInput,
  type UnifiedExecutionSemanticView,
} from './unified-execution-semantic-view';

/** 与 builderSemver 变更同步（语义规则变更时写 changelog） */
export const TRIP_EXECUTION_SEMANTIC_VIEW_BUILDER_ID =
  'trip.decision.executionSemanticView';

export const TRIP_EXECUTION_SEMANTIC_VIEW_BUILDER_SEMVER = '1.1.0';

export type BuildTripExecutionSemanticViewSnapshotInput =
  BuildUnifiedExecutionSemanticViewInput;

function stableStringify(value: unknown): string {
  if (value === null || typeof value !== 'object') {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return `{${keys.map(k => `${JSON.stringify(k)}:${stableStringify(obj[k])}`).join(',')}}`;
}

function fingerprintInputs(
  input: BuildUnifiedExecutionSemanticViewInput,
): string {
  const horizon = computeExecutionSemanticHorizon(input.planDates);
  const tp = input.temporalPropagationSummary;
  const digest = {
    semanticHorizon:
      horizon === undefined ? null : [horizon.start, horizon.end],
    planDates: [...(input.planDates ?? [])].sort(),
    weatherDates: Object.keys(input.weatherByDate ?? {}).sort(),
    weather: input.weatherByDate ?? {},
    auroraOpportunityDates: Object.keys(input.auroraOpportunityByDate ?? {}).sort(),
    auroraOpportunity: input.auroraOpportunityByDate ?? {},
    alerts: (input.alerts ?? [])
      .map(a => `${a.code}:${a.severity}:${a.message}`)
      .sort(),
    temporal: tp
      ? {
          emittedAt: tp.emittedAt,
          driftCount: tp.driftCount,
          constraintEdgeCount: tp.constraintEdgeCount,
          unifiedConstraintGraphStats: tp.unifiedConstraintGraphStats
            ? {
                nodeCount: tp.unifiedConstraintGraphStats.nodeCount,
                edgeCount: tp.unifiedConstraintGraphStats.edgeCount,
                driftNodeCount: tp.unifiedConstraintGraphStats.driftNodeCount,
                slotNodeCount: tp.unifiedConstraintGraphStats.slotNodeCount,
                bookingDeadlineNodeCount:
                  tp.unifiedConstraintGraphStats.bookingDeadlineNodeCount,
              }
            : undefined,
        }
      : null,
  };
  return createHash('sha256')
    .update(stableStringify(digest))
    .digest('hex')
    .slice(0, 32);
}

/**
 * 生成带 `authority` 的快照（引擎 / 测试均应使用此函数）。
 */
export function buildTripExecutionSemanticViewSnapshot(
  input: BuildTripExecutionSemanticViewSnapshotInput,
): UnifiedExecutionSemanticView {
  const base = buildUnifiedExecutionSemanticView(input);
  const horizon = computeExecutionSemanticHorizon(input.planDates);
  return {
    ...base,
    temporalScope:
      horizon !== undefined
        ? { asOf: base.emittedAt, horizon }
        : undefined,
    authority: {
      builderId: TRIP_EXECUTION_SEMANTIC_VIEW_BUILDER_ID,
      schemaVersion: '1',
      builderSemver: TRIP_EXECUTION_SEMANTIC_VIEW_BUILDER_SEMVER,
      inputsFingerprint: fingerprintInputs(input),
    },
  };
}
