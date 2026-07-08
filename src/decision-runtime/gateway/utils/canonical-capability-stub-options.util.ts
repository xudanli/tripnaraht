/**
 * Canonical L2 stub repair options when workspace/evaluate has not run yet.
 */

import type { DecisionOption } from '../../../trips/decision-semantics/types/decision-semantics.types';
import type { InternalUnifiedProblemRow } from './unified-decision-problem-projection.util';

export function buildCanonicalCapabilityStubOptions(
  row: InternalUnifiedProblemRow,
): DecisionOption[] {
  const problemId = row.problemId;
  const tripId = row.scope.tripId;

  switch (row.semanticKey) {
    case 'ROAD_SEGMENT_UNAVAILABLE':
      return [
        stubOption({
          id: 'road_accept_detour',
          problemId,
          type: 'ALTERNATIVE',
          title: '确认绕行该路段',
          description: '接受 F-road/路段封闭后的备用路线（提交后需 Apply 或 Evaluate）。',
          tripId,
          segmentIds: row.scope.routeSegmentIds,
        }),
        stubOption({
          id: 'road_defer_segment',
          problemId,
          type: 'REPAIR',
          title: '暂缓该路段，稍后决定',
          description: '保留问题待路况更新后再决策。',
          tripId,
        }),
      ];
    case 'EXCESSIVE_DAILY_LOAD':
      return [
        stubOption({
          id: 'load_split_day',
          problemId,
          type: 'REPAIR',
          title: '拆分高强度日',
          description: '将部分活动/驾驶移至相邻天，降低单日负荷。',
          tripId,
          dayIds: row.scope.dayIds,
        }),
        stubOption({
          id: 'load_reduce_stops',
          problemId,
          type: 'REPAIR',
          title: '减少当日停靠点',
          description: '删除或合并部分 POI，缩短驾驶与活动时间。',
          tripId,
          dayIds: row.scope.dayIds,
        }),
      ];
    default:
      return [];
  }
}

function stubOption(input: {
  id: string;
  problemId: string;
  type: DecisionOption['type'];
  title: string;
  description: string;
  tripId: string;
  segmentIds?: string[];
  dayIds?: number[];
}): DecisionOption {
  return {
    id: input.id,
    problemId: input.problemId,
    type: input.type,
    title: input.title,
    description: input.description,
    source: 'RULE_ENGINE',
    resolves: [],
    tradeoffs: [],
    executable: true,
    requiresConfirmation: true,
    executionCapability: 'GUIDED_MANUAL',
  };
}
