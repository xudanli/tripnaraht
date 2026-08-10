/**
 * Outcome Interpretation — 禁止将「用户行为/现实轨迹变化后未发生」直接记为 False Alert。
 */

import type { TemporalImpactDirection } from '../temporal-graduation/temporal-impact.util';

export const OUTCOME_INTERPRETATION_SCHEMA =
  'nara.temporal_outcome_interpretation@v1' as const;

export type OutcomeInterpretationHintsV1 = {
  /** 预测后用户改计划 / 改节奏 / 跳过活动等 */
  userTrajectoryChanged?: boolean;
  /** 外部现实变化（天气/封闭/承运变更等）使原轨迹失效 */
  externalRealityChanged?: boolean;
  /** 关键 outcome 字段不可观测 */
  observationGap?: boolean;
  /** 原始是否观测到恶化 */
  rawDeteriorated: boolean;
  observedDirection?: TemporalImpactDirection;
  onsetHours?: number | null;
  deadlineHours?: number | null;
};

export type OutcomeInterpretationV1 = {
  schemaId: typeof OUTCOME_INTERPRETATION_SCHEMA;
  version: 1;
  rawDeteriorated: boolean;
  /** null = 轨迹已变或观测缺口，不宜硬判 */
  interpretedDeteriorated: boolean | null;
  mayCountAsFalseAlert: boolean;
  mayCountAsMissedDeterioration: boolean;
  inconclusive: boolean;
  reasonZh: string;
  hints: OutcomeInterpretationHintsV1;
};

/**
 * 预测恶化但未发生恶化时：若用户/外部轨迹已变，或观测缺口 → 不计 False Alert。
 */
export function interpretTemporalOutcome(input: {
  predictedDirection: TemporalImpactDirection;
  hints: OutcomeInterpretationHintsV1;
}): OutcomeInterpretationV1 {
  const h = input.hints;
  const predWorsening = input.predictedDirection === 'WORSENING';
  const trajectoryInvalidated =
    !!h.userTrajectoryChanged || !!h.externalRealityChanged;
  const gap = !!h.observationGap;

  if (gap) {
    return {
      schemaId: OUTCOME_INTERPRETATION_SCHEMA,
      version: 1,
      rawDeteriorated: h.rawDeteriorated,
      interpretedDeteriorated: null,
      mayCountAsFalseAlert: false,
      mayCountAsMissedDeterioration: false,
      inconclusive: true,
      reasonZh: 'Observation Gap：关键 Outcome 不可观测，禁止硬判 False Alert / Miss',
      hints: h,
    };
  }

  if (trajectoryInvalidated && predWorsening && !h.rawDeteriorated) {
    return {
      schemaId: OUTCOME_INTERPRETATION_SCHEMA,
      version: 1,
      rawDeteriorated: h.rawDeteriorated,
      interpretedDeteriorated: null,
      mayCountAsFalseAlert: false,
      mayCountAsMissedDeterioration: false,
      inconclusive: true,
      reasonZh: h.userTrajectoryChanged
        ? '用户行为/行程轨迹已变，未发生事件不得直接记为 False Alert'
        : '现实轨迹因外部变化失效，未发生事件不得直接记为 False Alert',
      hints: h,
    };
  }

  return {
    schemaId: OUTCOME_INTERPRETATION_SCHEMA,
    version: 1,
    rawDeteriorated: h.rawDeteriorated,
    interpretedDeteriorated: h.rawDeteriorated,
    mayCountAsFalseAlert: predWorsening && !h.rawDeteriorated,
    mayCountAsMissedDeterioration: !predWorsening && h.rawDeteriorated,
    inconclusive: false,
    reasonZh: '轨迹可比：按原始观测计入 False Alert / Miss 统计',
    hints: h,
  };
}
