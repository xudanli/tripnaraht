/**
 * 日本 decision-closure P0 — 样本 trips DecisionLogEntry（伊豆半岛台风雨季场景）。
 */
import type { DecisionLogEntry } from '../../shared/decision-result.types';

export const JP_IZU_TYPHOON_DECISION_CLOSURE_LOGS: DecisionLogEntry[] = [
  {
    persona: 'ABU',
    action: 'REJECT',
    explanation: '伊豆半岛 Route 134 因台风雨与落石预警临时封闭',
    reasonCodes: ['WORLD_ROAD_CLOSED', 'ROUTE134', 'TYPHOON_RAIN'],
    evidenceRefs: ['ev-jp-route134-closed', 'ev-jp-jma-typhoon-alert'],
    timestamp: '2026-09-15T03:00:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
  },
  {
    persona: 'NEPTUNE',
    action: 'REPLACE',
    explanation: '改走 inland 箱根–御殿场缓冲线，热海温泉改至台风过境后一日',
    reasonCodes: ['SPATIAL_REPAIR', 'MIN_EDIT', 'TYPHOON_WINDOW'],
    evidenceRefs: ['ev-jp-route134-closed', 'ev-jp-onsen-reschedule'],
    timestamp: '2026-09-15T03:30:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'SPATIAL_REPAIR',
  },
];
