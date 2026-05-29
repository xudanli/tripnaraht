import type { TripAction } from '../../trips/road/trip-action.types';
import type { ObservationRecommendation } from './decision-state.types';

const clamp01 = (x: number): number => Math.min(1, Math.max(0, x));

/**
 * V(a_obs) = E[U(b′)] − U(b) − Cost(a_obs)
 * 量纲由调用方保证：`utility*` 与 `cost01` 同一尺度（例如均为 [0,1] 或均为 CGUS 标量）。
 */
export function computeObservationVoi(input: {
  utilityBefore: number;
  expectedUtilityAfter: number;
  cost01: number;
}): number {
  const costPenalty = clamp01(input.cost01);
  return input.expectedUtilityAfter - input.utilityBefore - costPenalty;
}

/**
 * 当缺乏显式后验 U(b′) 时，用「熵通道上的预期收缩 × 标定系数」近似 E[ΔU]（工程占位，供后续 ENN / 仿真替换）。
 */
export function proxyExpectedUtilityAfterObservation(input: {
  utilityBefore: number;
  entropy01: number;
  /** 该观测类型对当前熵通道的预期相对收缩 [0,1] */
  expectedEntropyReduction01: number;
  /** 熵从当前值向 0 收敛时，每单位（满刻度 1）带来的效用增量 */
  utilityPerEntropyUnit: number;
}): number {
  const ent = clamp01(input.entropy01);
  const red = clamp01(input.expectedEntropyReduction01);
  return input.utilityBefore + ent * red * input.utilityPerEntropyUnit;
}

export type ObservationRankingSignals = {
  utilityBefore: number;
  entropy01?: number;
  weatherRisk01?: number;
  fragilePoiIds?: string[];
  geo?: { lat: number; lng: number };
  /** SNS  crawl 默认成本（归一化） */
  defaultCostSns?: number;
  /** POI 核验默认成本（归一化） */
  defaultCostPoi?: number;
  /** 熵 → 效用近似的标定（与 optimizationHints.expectedUtility 同量纲时取小值，如 0.05–0.2） */
  utilityPerEntropyUnit?: number;
};

/**
 * 由不确定性信号生成候选观测及 VOI 分数；不含网络 I/O，仅决策层可审计启发式。
 * 编排层取 `voiScore` 降序，在 RESEARCH 阶段 materialize 为 ReflectiveAgent / 工具调用。
 */
export function rankObservationActionsFromSignals(
  signals: ObservationRankingSignals,
): ObservationRecommendation[] {
  const utilityBefore = signals.utilityBefore;
  const entropy01 = clamp01(signals.entropy01 ?? 0);
  const weatherRisk01 = clamp01(signals.weatherRisk01 ?? 0);
  const uPerH = signals.utilityPerEntropyUnit ?? 0.12;
  const costSns = clamp01(signals.defaultCostSns ?? 0.18);
  const costPoi = clamp01(signals.defaultCostPoi ?? 0.12);

  const out: ObservationRecommendation[] = [];

  const snsEntropyReduction =
    weatherRisk01 >= 0.55 ? 0.55 : weatherRisk01 >= 0.35 ? 0.38 : entropy01 >= 0.42 ? 0.28 : 0.18;

  if (weatherRisk01 >= 0.35 || entropy01 >= 0.38) {
    const action: Extract<TripAction, { type: 'OBSERVATION_SNS_CRAWL' }> = {
      type: 'OBSERVATION_SNS_CRAWL',
      ...(signals.geo ? { center: signals.geo, radiusKm: 40 } : {}),
      queryTerms: ['snow', 'road', 'closed', 'weather'],
      estimatedCost01: costSns,
      rationale: 'High weather / epistemic load: social signal may resolve road-access ambiguity.',
    };
    const expectedAfter = proxyExpectedUtilityAfterObservation({
      utilityBefore,
      entropy01: Math.max(entropy01, weatherRisk01 * 0.85),
      expectedEntropyReduction01: snsEntropyReduction,
      utilityPerEntropyUnit: uPerH,
    });
    const voiScore = computeObservationVoi({
      utilityBefore,
      expectedUtilityAfter: expectedAfter,
      cost01: costSns,
    });
    out.push({
      action,
      voiScore,
      voiAudit: {
        utilityBefore,
        expectedUtilityAfter: expectedAfter,
        costPenalty: costSns,
      },
      rationale: action.rationale,
    });
  }

  for (const poiId of signals.fragilePoiIds ?? []) {
    const action: Extract<TripAction, { type: 'OBSERVATION_POI_VERIFY' }> = {
      type: 'OBSERVATION_POI_VERIFY',
      poiId,
      verifyChannels: ['WEB', 'OPERATOR_API'],
      estimatedCost01: costPoi,
      rationale: 'Fragile corridor / POI: operator or live status reduces epistemic tail risk.',
    };
    const expectedAfter = proxyExpectedUtilityAfterObservation({
      utilityBefore,
      entropy01: Math.max(entropy01, 0.25),
      expectedEntropyReduction01: 0.32,
      utilityPerEntropyUnit: uPerH * 0.9,
    });
    const voiScore = computeObservationVoi({
      utilityBefore,
      expectedUtilityAfter: expectedAfter,
      cost01: costPoi,
    });
    out.push({
      action,
      voiScore,
      voiAudit: {
        utilityBefore,
        expectedUtilityAfter: expectedAfter,
        costPenalty: costPoi,
      },
      rationale: action.rationale,
    });
  }

  out.sort((a, b) => {
    const diff = b.voiScore - a.voiScore;
    if (Math.abs(diff) > 1e-6) {
      return diff;
    }
    const snsBoost = (x: ObservationRecommendation) =>
      x.action.type === 'OBSERVATION_SNS_CRAWL' && weatherRisk01 >= 0.65 ? 1 : 0;
    return snsBoost(b) - snsBoost(a);
  });
  return out;
}
