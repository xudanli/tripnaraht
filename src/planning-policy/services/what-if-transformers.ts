import type { DayScheduleResult } from '../interfaces/scheduler.interface';
import type { OptimizationSuggestion, WhatIfAction } from '../services/robustness-evaluator.service';
import {
  addBufferBeforePoi,
  removePoiFromSchedule,
  shiftScheduleEarlier,
  swapWithNeighborPoi,
} from '../utils/what-if-schedule-transform.util';

export interface WhatIfTransformResult {
  schedule: DayScheduleResult;
  action: WhatIfAction;
  title: string;
  description: string;
  candidateId: string;
}

/** Expand optimization suggestions into concrete schedule transforms. */
export function expandWhatIfTransforms(
  baseSchedule: DayScheduleResult,
  suggestions: OptimizationSuggestion[],
): WhatIfTransformResult[] {
  const results: WhatIfTransformResult[] = [];

  for (const s of suggestions) {
    if (s.type === 'SHIFT_EARLIER') {
      results.push({
        schedule: shiftScheduleEarlier(baseSchedule, s.poiId, s.minutes),
        action: { type: 'SHIFT_EARLIER', poiId: s.poiId, minutes: s.minutes },
        title: `提前 ${s.minutes} 分钟`,
        description: `${s.poiId} 前移 ${s.minutes} 分钟（最小扰动）`,
        candidateId: `SHIFT:${s.poiId}:${s.minutes}`,
      });
    }

    if (s.type === 'REORDER_AVOID_WAIT') {
      for (const direction of ['PREV', 'NEXT'] as const) {
        results.push({
          schedule: swapWithNeighborPoi(baseSchedule, s.poiId, direction),
          action: { type: 'SWAP_NEIGHBOR', poiId: s.poiId, direction },
          title: direction === 'PREV' ? '换序（与前一个 POI 交换）' : '换序（与后一个 POI 交换）',
          description: `尝试通过换序降低等待风险（分段营业/午休）`,
          candidateId: `SWAP_${direction}:${s.poiId}`,
        });
      }
    }

    if (s.type === 'REMOVE_OPTIONAL') {
      results.push({
        schedule: removePoiFromSchedule(baseSchedule, s.poiId),
        action: { type: 'REMOVE_ITEM', poiId: s.poiId },
        title: '移除低优先级停留点',
        description: s.reason ?? `取消 ${s.poiId} 以释放时间缓冲`,
        candidateId: `REMOVE:${s.poiId}`,
      });
    }

    if (s.type === 'ADD_BUFFER') {
      results.push({
        schedule: addBufferBeforePoi(baseSchedule, s.poiId, s.minutes),
        action: { type: 'ADD_BUFFER', poiId: s.poiId, minutes: s.minutes },
        title: `增加 ${s.minutes} 分钟缓冲`,
        description: s.reason ?? `在 ${s.poiId} 前增加缓冲`,
        candidateId: `BUFFER:${s.poiId}:${s.minutes}`,
      });
    }
  }

  return results;
}
