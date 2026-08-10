/**
 * TemporalPresentationPolicy — 控制是否展示、确定性语言与时间精度。
 * 原则：UI 表达精度不得高于预测真实精度（Accurate Prediction ≠ Useful Intervention 的表达侧）。
 */

import type { EvidenceFactV1 } from '../../harness/hardening/evidence.contract';
import { classifyEvidenceBucket } from '../../harness/hardening/evidence.contract';
import type { TemporalImpactV1 } from '../temporal-graduation/temporal-impact.util';
import type { ConfidenceCalibrationV1 } from '../temporal-shadow-validation/confidence-calibration.util';
import type { TemporalVisibilityDecisionV1 } from './visibility-gate.util';

export const TEMPORAL_PRESENTATION_POLICY_SCHEMA =
  'nara.temporal_presentation_policy@v1' as const;

export type CertaintyLanguageV1 =
  | 'MAY'
  | 'LIKELY'
  | 'EXPECTED'
  | 'WITHHOLD';

export type TimePrecisionV1 =
  | 'DAY_BAND'
  | 'HALF_DAY'
  | 'HOUR_BAND'
  | 'EXACT_HOUR_FORBIDDEN';

export type TemporalPresentationPolicyV1 = {
  schemaId: typeof TEMPORAL_PRESENTATION_POLICY_SCHEMA;
  version: 1;
  scenarioId: string;
  mayPresentToUser: boolean;
  certaintyLanguage: CertaintyLanguageV1;
  timePrecision: TimePrecisionV1;
  /** UI 不得声称高于此的精度 */
  maxExpressibleConfidence: number;
  statedConfidence: number;
  uiPrecisionMustNotExceedPredictionPrecision: true;
  reasonZh: string[];
  proactivePushForbidden: true;
};

function worstFreshnessRank(evidence: EvidenceFactV1[]): number {
  const bag = classifyEvidenceBucket(evidence);
  if (bag.unavailable > 0) return 3;
  if (bag.assumed > 0) return 2;
  if (bag.stale > 0) return 1;
  if (bag.verified > 0) return 0;
  return 3;
}

/**
 * 根据 Evidence / Freshness / Confidence / Calibration 生成展示策略。
 */
export function buildTemporalPresentationPolicy(input: {
  visibility: TemporalVisibilityDecisionV1;
  impact: TemporalImpactV1;
  evidence: EvidenceFactV1[];
  statedConfidence: number;
  calibration: ConfidenceCalibrationV1;
  /** 预测时间误差（小时）；未知则保守 */
  onsetErrorHours?: number | null;
}): TemporalPresentationPolicyV1 {
  const reasonsZh: string[] = [];
  const conf = Math.max(0, Math.min(1, input.statedConfidence));
  const freshRank = worstFreshnessRank(input.evidence);
  const calibrated = input.calibration.calibrated;
  const ece = input.calibration.ece;

  if (!input.visibility.allowUserVisibleTemporal) {
    return {
      schemaId: TEMPORAL_PRESENTATION_POLICY_SCHEMA,
      version: 1,
      scenarioId: input.visibility.scenarioId,
      mayPresentToUser: false,
      certaintyLanguage: 'WITHHOLD',
      timePrecision: 'EXACT_HOUR_FORBIDDEN',
      maxExpressibleConfidence: 0,
      statedConfidence: conf,
      uiPrecisionMustNotExceedPredictionPrecision: true,
      reasonZh: ['Quality Gate 未过或未授权 USER_VISIBLE → 不向用户展示'],
      proactivePushForbidden: true,
    };
  }

  if (!calibrated || ece > 0.25) {
    reasonsZh.push('校准不可信或 ECE 过高 → 降级确定性语言');
  }
  if (freshRank >= 2) {
    reasonsZh.push('Evidence 偏 ASSUMED/UNAVAILABLE → 降级展示');
  }
  if (freshRank === 1) {
    reasonsZh.push('存在 STALE Evidence → 限制时间精度');
  }

  /** 可表达置信度不得超过 statedConfidence，且校准差时再压低 */
  let maxExpressible = conf;
  if (!calibrated) maxExpressible = Math.min(maxExpressible, 0.45);
  else if (ece > 0.15) maxExpressible = Math.min(maxExpressible, conf - 0.1);
  if (freshRank >= 2) maxExpressible = Math.min(maxExpressible, 0.4);
  else if (freshRank === 1) maxExpressible = Math.min(maxExpressible, conf - 0.05);
  maxExpressible = Math.max(0, Math.min(conf, maxExpressible));

  let certainty: CertaintyLanguageV1 = 'MAY';
  if (maxExpressible >= 0.75 && calibrated && freshRank === 0) {
    certainty = 'EXPECTED';
  } else if (maxExpressible >= 0.55 && freshRank <= 1) {
    certainty = 'LIKELY';
  } else if (maxExpressible < 0.35 || freshRank >= 3) {
    certainty = 'WITHHOLD';
  }

  const onsetErr = input.onsetErrorHours;
  let timePrecision: TimePrecisionV1 = 'DAY_BAND';
  if (onsetErr == null || onsetErr > 18 || freshRank >= 2) {
    timePrecision = 'DAY_BAND';
  } else if (onsetErr > 8 || freshRank === 1) {
    timePrecision = 'HALF_DAY';
  } else if (onsetErr <= 8 && calibrated && freshRank === 0) {
    timePrecision = 'HOUR_BAND';
  }
  /** 永远禁止伪装成精确到整点的确定性 */
  if (timePrecision === 'HOUR_BAND' && maxExpressible < 0.7) {
    timePrecision = 'HALF_DAY';
  }

  const mayPresent = certainty !== 'WITHHOLD';
  if (!mayPresent) {
    reasonsZh.push('确定性过低 → WITHHOLD，不展示');
  } else {
    reasonsZh.push(
      `展示允许：语言=${certainty} 时间精度=${timePrecision} maxConf=${maxExpressible.toFixed(2)}≤stated=${conf.toFixed(2)}`,
    );
  }
  reasonsZh.push('UI 表达精度不得高于预测真实精度');

  return {
    schemaId: TEMPORAL_PRESENTATION_POLICY_SCHEMA,
    version: 1,
    scenarioId: input.visibility.scenarioId,
    mayPresentToUser: mayPresent,
    certaintyLanguage: certainty,
    timePrecision,
    maxExpressibleConfidence: maxExpressible,
    statedConfidence: conf,
    uiPrecisionMustNotExceedPredictionPrecision: true,
    reasonZh: reasonsZh,
    proactivePushForbidden: true,
  };
}

/**
 * 渲染前护栏：拒绝高于策略的语言/时间精度。
 */
export function assertPresentationWithinPolicy(input: {
  policy: TemporalPresentationPolicyV1;
  requestedCertainty: CertaintyLanguageV1;
  requestedTimePrecision: TimePrecisionV1;
  claimedConfidence: number;
}): { ok: true } | { ok: false; code: string; reasonZh: string } {
  const orderC: CertaintyLanguageV1[] = [
    'WITHHOLD',
    'MAY',
    'LIKELY',
    'EXPECTED',
  ];
  const orderT: TimePrecisionV1[] = [
    'EXACT_HOUR_FORBIDDEN',
    'DAY_BAND',
    'HALF_DAY',
    'HOUR_BAND',
  ];
  if (!input.policy.mayPresentToUser) {
    return {
      ok: false,
      code: 'PRESENTATION_WITHHELD',
      reasonZh: '策略禁止展示',
    };
  }
  if (
    orderC.indexOf(input.requestedCertainty) >
    orderC.indexOf(input.policy.certaintyLanguage)
  ) {
    return {
      ok: false,
      code: 'CERTAINTY_EXCEEDS_POLICY',
      reasonZh: 'UI 确定性语言高于策略允许（精度不得高于预测真实精度）',
    };
  }
  if (
    orderT.indexOf(input.requestedTimePrecision) >
    orderT.indexOf(input.policy.timePrecision)
  ) {
    return {
      ok: false,
      code: 'TIME_PRECISION_EXCEEDS_POLICY',
      reasonZh: 'UI 时间精度高于策略允许',
    };
  }
  if (input.claimedConfidence > input.policy.maxExpressibleConfidence + 1e-9) {
    return {
      ok: false,
      code: 'CONFIDENCE_EXCEEDS_POLICY',
      reasonZh: 'UI 声称置信度高于可表达上限',
    };
  }
  return { ok: true };
}
