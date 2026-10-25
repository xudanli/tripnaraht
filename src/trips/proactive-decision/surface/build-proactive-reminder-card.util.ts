/**
 * PD-6 — Build three-layer reminder card from Impact + Synthesis.
 */

import type { ProactiveImpactV1 } from '../contracts/proactive-impact.types';
import type { ProactiveSynthesisV1 } from '../synthesis/proactive-synthesis.types';
import {
  PROACTIVE_REMINDER_CARD_SCHEMA,
  type ProactiveReminderCardV1,
} from './proactive-reminder-card.types';

const SIGNAL_WHAT_ZH: Record<ProactiveImpactV1['signalKind'], string> = {
  WEATHER_WIND: '附近风力预计增强',
  WEATHER_BLIZZARD: '暴雪/极端风力可能影响户外活动',
  WEATHER_HEAVY_RAIN: '强降雨可能影响行程体验',
  ROAD_CLOSURE: '相关道路已关闭或不可通行',
  ROAD_DIFFICULTY_CHANGE: '相关道路通行难度上升',
  ROUTE_AVAILABILITY_CHANGE: '路线可用性发生变化',
};

export function buildProactiveReminderCard(input: {
  impact: ProactiveImpactV1;
  synthesis: ProactiveSynthesisV1;
  decisionProblemId?: string;
  interventionCandidateId?: string;
}): ProactiveReminderCardV1 {
  const labels =
    input.impact.affectedItemLabels?.length
      ? input.impact.affectedItemLabels.join('、')
      : input.impact.affectedItems.join('、');

  const what = SIGNAL_WHAT_ZH[input.impact.signalKind];
  const titleZh =
    input.impact.caseId === 'CASE_REROUTE'
      ? '今天的路线计划可能需要调整'
      : '今天下午的活动计划可能需要调整';

  return {
    schemaId: PROACTIVE_REMINDER_CARD_SCHEMA,
    version: 1,
    tripId: input.impact.tripId,
    caseId: input.synthesis.caseId,
    decisionProblemId: input.decisionProblemId,
    interventionCandidateId: input.interventionCandidateId,
    titleZh,
    layer1WhatHappenedZh: what,
    layer2WhatImpactedZh: labels
      ? `这会影响你的计划：${labels}`
      : '这可能影响你当前行程中的相关安排。',
    layer3SuggestionZh: input.synthesis.surfaceL3.suggestionZh,
    layer3BenefitsZh: [...input.synthesis.surfaceL3.benefitsZh],
    recommendedOptionId: input.synthesis.recommended.optionId,
    ctas: [
      { id: 'VIEW_OPTIONS', labelZh: '查看调整方案' },
      { id: 'DEFER', labelZh: '暂不调整' },
      { id: 'WHY', labelZh: '为什么？' },
    ],
    whyPreviewZh: input.synthesis.reasonZh,
  };
}
