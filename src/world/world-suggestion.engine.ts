/**
 * Suggestion Engine — 系统主动提案「如何改世界」而非只返回计划文本
 */

import type { WorldConstraintDiff } from './world-diff.engine';
import type { WorldCommand } from './world-command.types';

export interface WorldSuggestion {
  readonly id: string;
  readonly type: 'REPLAN_OPTION' | 'WORLD_MUTATION';
  readonly title: string;
  readonly rationale: string;
  readonly suggestedCommand?: WorldCommand;
  readonly diffPreview?: WorldConstraintDiff;
  readonly expectedImpact:
    | 'LOW_TIME_GAIN_HIGH_STABILITY'
    | 'MODERATE_ADJUSTMENT'
    | 'MAJOR_RESTRUCTURE';
}

/**
 * 路网阻断时的 MVP 提案：绕行意图 / 日程微调（由 UI 决定是否采纳为 WorldCommand）
 */
export function suggestWorldMutationsAfterRoadBlocked(params: {
  readonly roadId: string;
  readonly affectedSlotIds?: readonly string[];
  readonly affectedPoiIds?: readonly string[];
}): WorldSuggestion[] {
  const { roadId, affectedSlotIds, affectedPoiIds } = params;
  return [
    {
      id: `sugg_avoid_${roadId}`,
      type: 'WORLD_MUTATION',
      title: `主动规避 ${roadId}`,
      rationale:
        '将该路段视为对用户不可用，触发围绕剩余可走网络的局部重排（不改写其它域除非联动）。',
      suggestedCommand: {
        type: 'BLOCK_ROAD',
        roadId,
        ...(affectedSlotIds?.length ? { affectedSlotIds: [...affectedSlotIds] } : {}),
        ...(affectedPoiIds?.length ? { affectedPoiIds: [...affectedPoiIds] } : {}),
      },
      expectedImpact: 'MODERATE_ADJUSTMENT',
    },
    {
      id: `sugg_shift_${roadId}`,
      type: 'REPLAN_OPTION',
      title: '前移出发或互换两日 POI',
      rationale:
        '若阻断持续整日，可优先尝试日历日内顺序调整；具体命令仍由你在世界里确认。',
      expectedImpact: 'LOW_TIME_GAIN_HIGH_STABILITY',
    },
  ];
}
