/**
 * Confidence Calibration — 验证预测置信度与真实准确率是否匹配。
 */

import type { TemporalShadowRecordV1 } from './temporal-shadow-record.util';

export const CONFIDENCE_CALIBRATION_SCHEMA =
  'nara.temporal_confidence_calibration@v1' as const;

export type ConfidenceBinV1 = {
  label: string;
  minExclusive: number;
  maxInclusive: number;
  n: number;
  avgStatedConfidence: number;
  directionHitRate: number;
  absGap: number;
};

export type ConfidenceCalibrationV1 = {
  schemaId: typeof CONFIDENCE_CALIBRATION_SCHEMA;
  version: 1;
  scenarioId: string;
  bins: ConfidenceBinV1[];
  /** Expected Calibration Error 近似 */
  ece: number;
  calibrated: boolean;
  rationaleZh: string[];
};

const DEFAULT_BINS: Array<{
  label: string;
  minExclusive: number;
  maxInclusive: number;
}> = [
  { label: 'low', minExclusive: -0.001, maxInclusive: 0.4 },
  { label: 'mid', minExclusive: 0.4, maxInclusive: 0.7 },
  { label: 'high', minExclusive: 0.7, maxInclusive: 1.001 },
];

/**
 * 按场景校准：statedConfidence vs directionHit。
 */
export function calibrateTemporalConfidence(input: {
  scenarioId: string;
  records: TemporalShadowRecordV1[];
  maxEce?: number;
}): ConfidenceCalibrationV1 {
  const maxEce = input.maxEce ?? 0.2;
  const usable = input.records.filter(
    (r) =>
      r.scenarioId === input.scenarioId &&
      r.evaluation != null &&
      !r.outcomeInterpretation?.inconclusive,
  );

  const bins: ConfidenceBinV1[] = DEFAULT_BINS.map((b) => {
    const rows = usable.filter(
      (r) =>
        r.statedConfidence > b.minExclusive &&
        r.statedConfidence <= b.maxInclusive,
    );
    const n = rows.length;
    const avgConf =
      n === 0
        ? 0
        : rows.reduce((s, r) => s + r.statedConfidence, 0) / n;
    const hitRate =
      n === 0
        ? 0
        : rows.filter((r) => r.evaluation!.directionHit).length / n;
    return {
      label: b.label,
      minExclusive: b.minExclusive,
      maxInclusive: b.maxInclusive,
      n,
      avgStatedConfidence: avgConf,
      directionHitRate: hitRate,
      absGap: n === 0 ? 0 : Math.abs(avgConf - hitRate),
    };
  });

  const totalN = usable.length;
  const ece =
    totalN === 0
      ? 1
      : bins.reduce((s, b) => s + b.n * b.absGap, 0) / totalN;

  const calibrated = totalN > 0 && ece <= maxEce;
  const rationaleZh: string[] = [
    `可比样本 n=${totalN}（已排除 inconclusive）`,
    `ECE=${ece.toFixed(3)}（阈值 ${maxEce}）`,
  ];
  for (const b of bins) {
    if (b.n === 0) continue;
    rationaleZh.push(
      `${b.label}: conf=${b.avgStatedConfidence.toFixed(2)} hit=${b.directionHitRate.toFixed(2)} gap=${b.absGap.toFixed(2)} n=${b.n}`,
    );
  }
  if (!calibrated) {
    rationaleZh.push(
      totalN === 0
        ? '置信度校准不可信：无可比样本'
        : '置信度与准确率偏差过大，置信度暂不可信',
    );
  } else {
    rationaleZh.push('置信度与真实准确率大致匹配');
  }

  return {
    schemaId: CONFIDENCE_CALIBRATION_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    bins,
    ece,
    calibrated,
    rationaleZh,
  };
}

/** 由规则强度推导声明置信度（deterministic，非 ML） */
export function statedConfidenceFromRuleId(ruleId: string): number {
  if (ruleId.includes('fatigue_and_packed') || ruleId.includes('late_or_overload')) {
    return 0.82;
  }
  if (ruleId.includes('single_stressor') || ruleId.includes('friction')) {
    return 0.68;
  }
  if (ruleId.includes('stable_default')) {
    return 0.55;
  }
  return 0.6;
}
