/**
 * 冰岛 decision-closure P0 — 样本 trips DecisionLogEntry（F208 风暴场景）。
 */
import type { DecisionLogEntry } from '../../shared/decision-result.types';

export const ICELAND_F208_DECISION_CLOSURE_LOGS: DecisionLogEntry[] = [
  {
    persona: 'ABU',
    action: 'REJECT',
    explanation: 'F208 封路，南岸路段不可通行',
    reasonCodes: ['WORLD_ROAD_CLOSED', 'F208'],
    evidenceRefs: ['ev-road-f208-closed'],
    timestamp: '2026-01-16T12:00:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
  },
  {
    persona: 'NEPTUNE',
    action: 'REPLACE',
    explanation: '替换 F208 高地段为南岸铺装备选',
    reasonCodes: ['SPATIAL_REPAIR', 'MIN_EDIT'],
    evidenceRefs: ['ev-road-f208-closed', 'ev-repair-v2'],
    timestamp: '2026-01-16T12:05:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'SPATIAL_REPAIR',
  },
];
