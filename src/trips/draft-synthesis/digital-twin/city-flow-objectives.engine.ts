import type { CityDigitalTwin } from './city-digital-twin.types';

export interface CityFlowScore {
  score: number;
  breakdown: {
    satisfactionProxy: number;
    throughputProxy: number;
    utilizationProxy: number;
    congestionPenalty: number;
    conflictPenalty: number;
    wastePenalty: number;
  };
}

/**
 * 城市级粗粒度目标函数占位（与 Governance / Global Optimization 对齐时可替换为学习权重）。
 */
export function scoreCityFlowState(twin: CityDigitalTwin): CityFlowScore {
  const congestionVals = Object.values(twin.mobilityLayer.congestion);
  const avgCong =
    congestionVals.length > 0 ? congestionVals.reduce((a, b) => a + b, 0) / congestionVals.length : 0;

  const queueVals = Object.values(twin.poiLayer.liveQueue);
  const avgQueue = queueVals.length > 0 ? queueVals.reduce((a, b) => a + b, 0) / queueVals.length : 0;

  const utilizationProxy = Math.min(1, avgQueue * 1.1 + twin.demandLayer.userFlows * 0.01);
  const throughputProxy = Math.min(1, twin.demandLayer.userFlows * 0.02 + (1 - avgCong) * 0.5);
  const satisfactionProxy = Math.min(1, (1 - avgCong) * 0.45 + (1 - avgQueue) * 0.35 + 0.2);

  const congestionPenalty = avgCong;
  const conflictPenalty = Math.min(1, avgQueue * 0.8);
  const wastePenalty = Math.abs(0.55 - utilizationProxy);

  const score =
    0.28 * satisfactionProxy +
    0.22 * throughputProxy +
    0.2 * utilizationProxy -
    0.12 * congestionPenalty -
    0.1 * conflictPenalty -
    0.08 * wastePenalty;

  return {
    score: Math.max(-1, Math.min(1, score)),
    breakdown: {
      satisfactionProxy,
      throughputProxy,
      utilizationProxy,
      congestionPenalty,
      conflictPenalty,
      wastePenalty,
    },
  };
}
