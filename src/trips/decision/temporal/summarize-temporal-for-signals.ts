/**
 * 将 plan.temporal 压缩为 ExternalSignalsState 可序列化摘要（Agent / 约束 / 日志）
 */

import type {
  TemporalPropagationSignalSummary,
  TemporalPropagationSnapshot,
} from './temporal-propagation.types';
import type { PropagationPolicy } from './time-drift.types';

export type { TemporalPropagationSignalSummary };

export function summarizeTemporalPropagationForSignals(
  snapshot: TemporalPropagationSnapshot | undefined,
): TemporalPropagationSignalSummary | undefined {
  if (!snapshot) {
    return undefined;
  }

  const drifts = snapshot.timeDrifts ?? [];
  const policyCounts: Partial<Record<PropagationPolicy, number>> = {};
  let totalSequenceDeltaMinutes = 0;
  let totalGlobalSlackMinutes = 0;
  let totalCrossDayDeltaMinutes = 0;

  for (const d of drifts) {
    policyCounts[d.propagationPolicy] =
      (policyCounts[d.propagationPolicy] ?? 0) + 1;
    if (d.propagationPolicy === 'PROPAGATE_SEQUENCE') {
      totalSequenceDeltaMinutes += d.deltaMinutes;
    }
    if (d.propagationPolicy === 'ACCUMULATE_GLOBAL_SLACK') {
      totalGlobalSlackMinutes += d.deltaMinutes;
    }
    if (d.propagationPolicy === 'PROPAGATE_CROSS_DAY') {
      totalCrossDayDeltaMinutes += d.deltaMinutes;
    }
  }

  const downstreamIds = snapshot.downstreamShiftedSlotIds ?? [];
  const crossDayIds = snapshot.crossDayShiftedSlotIds ?? [];
  const crossDayDriftCount = drifts.filter(
    d => d.propagationPolicy === 'PROPAGATE_CROSS_DAY',
  ).length;

  const ug = snapshot.unifiedConstraintGraph;
  const unifiedConstraintGraphStats = ug
    ? {
        version: '1' as const,
        nodeCount: ug.stats.nodeCount,
        edgeCount: ug.stats.edgeCount,
        driftNodeCount: ug.stats.driftNodeCount,
        slotNodeCount: ug.stats.slotNodeCount,
        bookingDeadlineNodeCount: ug.stats.bookingDeadlineNodeCount,
        domainNodeCounts: ug.stats.domainNodeCounts,
        domainEdgeCounts: ug.stats.domainEdgeCounts,
      }
    : undefined;

  return {
    emittedAt: snapshot.emittedAt,
    driftCount: drifts.length,
    constraintEdgeCount: snapshot.constraintEdges?.length ?? 0,
    totalSequenceDeltaMinutes,
    totalGlobalSlackMinutes,
    policyCounts,
    downstreamShiftedSlotCount: downstreamIds.length,
    downstreamShiftedSlotIds:
      downstreamIds.length > 0 ? [...downstreamIds] : undefined,
    crossDayDriftCount,
    totalCrossDayDeltaMinutes,
    crossDayShiftedSlotCount: crossDayIds.length,
    crossDayShiftedSlotIds:
      crossDayIds.length > 0 ? [...crossDayIds] : undefined,
    ...(unifiedConstraintGraphStats
      ? { unifiedConstraintGraphStats }
      : {}),
  };
}
