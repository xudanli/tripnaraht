/**
 * 澳大利亚 decision-closure P0 — 样本 trips DecisionLogEntry（Great Ocean Road 封路场景）。
 */
import type { DecisionLogEntry } from '../../shared/decision-result.types';

export const AU_GOR_FIRE_DECISION_CLOSURE_LOGS: DecisionLogEntry[] = [
  {
    persona: 'ABU',
    action: 'REJECT',
    explanation: 'Great Ocean Road B100 段因山火烟雾与临时封路不可通行',
    reasonCodes: ['WORLD_ROAD_CLOSED', 'B100', 'BUSHFIRE_SMOKE'],
    evidenceRefs: ['ev-au-b100-closed', 'ev-au-cfa-fire-advice'],
    timestamp: '2026-01-18T06:00:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'ABU_GATE',
  },
  {
    persona: 'NEPTUNE',
    action: 'REPLACE',
    explanation: '改走 inland Otway 备选线，十二门徒改至次日清晨低烟窗',
    reasonCodes: ['SPATIAL_REPAIR', 'MIN_EDIT', 'SMOKE_WINDOW'],
    evidenceRefs: ['ev-au-b100-closed', 'ev-au-twelve-apostles-reschedule'],
    timestamp: '2026-01-18T06:30:00.000Z',
    decisionSource: 'PHYSICAL',
    decisionStage: 'SPATIAL_REPAIR',
  },
];
