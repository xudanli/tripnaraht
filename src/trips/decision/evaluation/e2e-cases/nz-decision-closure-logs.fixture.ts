/**
 * 新西兰 decision-closure P0 — 样本 trips DecisionLogEntry（Milford / SH94 暴雨场景）。
 */
import type { DecisionLogEntry } from '../../shared/decision-result.types';

export const NZ_MILFORD_RAIN_DECISION_CLOSURE_LOGS: DecisionLogEntry[] = [
  {
    persona: 'ABU',
    action: 'REJECT',
    explanation: 'SH94 峡湾公路因暴雨与落石风险临时封闭',
    reasonCodes: ['WORLD_ROAD_CLOSED', 'SH94', 'HEAVY_RAIN'],
    evidenceRefs: ['ev-nz-sh94-closed', 'ev-nz-met-heavy-rain'],
    timestamp: '2026-03-12T08:00:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
  },
  {
    persona: 'NEPTUNE',
    action: 'REPLACE',
    explanation: '将 Milford Sound 游船改至次日天气窗，改走 Te Anau 缓冲日',
    reasonCodes: ['SPATIAL_REPAIR', 'MIN_EDIT', 'WEATHER_WINDOW'],
    evidenceRefs: ['ev-nz-sh94-closed', 'ev-nz-cruise-reschedule'],
    timestamp: '2026-03-12T08:30:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'SPATIAL_REPAIR',
  },
];
