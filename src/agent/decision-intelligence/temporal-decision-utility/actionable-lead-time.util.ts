/**
 * ActionableLeadTime — 验证「提前知道」是否真正增加有效行动窗口。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';

export const ACTIONABLE_LEAD_TIME_SCHEMA =
  'nara.actionable_lead_time@v1' as const;

export type ActionableLeadTimeSampleV1 = {
  sampleId: string;
  scenarioId: TemporalScenarioId;
  /** 预测给出的 lead（小时） */
  predictedLeadHours: number;
  /** 用户实际可用行动窗口（小时） */
  usableActionWindowHours: number;
  /** 无 Temporal 时的可用窗口（对照） */
  controlActionWindowHours: number;
  actedInWindow: boolean;
};

export type ActionableLeadTimeReportV1 = {
  schemaId: typeof ACTIONABLE_LEAD_TIME_SCHEMA;
  version: 1;
  scenarioId: TemporalScenarioId;
  n: number;
  avgPredictedLeadHours: number;
  avgUsableWindowHours: number;
  avgControlWindowHours: number;
  avgLeadGainHours: number;
  actedInWindowRate: number;
  /** 预测 lead 中真正可行动的比例 */
  actionableFraction: number;
  passed: boolean;
  reasonsZh: string[];
};

/**
 * 「提前知道」必须转化为可用行动窗口增益，否则不算有用。
 */
export function evaluateActionableLeadTime(input: {
  scenarioId: TemporalScenarioId;
  samples: ActionableLeadTimeSampleV1[];
  minSamples?: number;
  minAvgLeadGainHours?: number;
  minActedInWindowRate?: number;
  minActionableFraction?: number;
}): ActionableLeadTimeReportV1 {
  const minN = input.minSamples ?? 5;
  const minGain = input.minAvgLeadGainHours ?? 2;
  const minActed = input.minActedInWindowRate ?? 0.5;
  const minFrac = input.minActionableFraction ?? 0.4;
  const rows = input.samples.filter((s) => s.scenarioId === input.scenarioId);
  const n = rows.length;

  const avg = (xs: number[]) =>
    xs.length === 0 ? 0 : xs.reduce((a, b) => a + b, 0) / xs.length;

  const avgPredictedLeadHours = avg(rows.map((r) => r.predictedLeadHours));
  const avgUsableWindowHours = avg(rows.map((r) => r.usableActionWindowHours));
  const avgControlWindowHours = avg(rows.map((r) => r.controlActionWindowHours));
  const avgLeadGainHours = avg(
    rows.map((r) => r.usableActionWindowHours - r.controlActionWindowHours),
  );
  const actedInWindowRate =
    n === 0 ? 0 : rows.filter((r) => r.actedInWindow).length / n;
  const actionableFraction =
    n === 0
      ? 0
      : avg(
          rows.map((r) =>
            r.predictedLeadHours <= 0
              ? 0
              : Math.min(
                  1,
                  r.usableActionWindowHours / r.predictedLeadHours,
                ),
          ),
        );

  const reasonsZh: string[] = [];
  if (n < minN) reasonsZh.push(`样本不足 ${n} < ${minN}`);
  if (avgLeadGainHours < minGain) {
    reasonsZh.push(
      `有效行动窗口增益不足 ${avgLeadGainHours.toFixed(1)}h < ${minGain}h`,
    );
  }
  if (actedInWindowRate < minActed) {
    reasonsZh.push(
      `窗口内行动率 ${actedInWindowRate.toFixed(2)} < ${minActed}`,
    );
  }
  if (actionableFraction < minFrac) {
    reasonsZh.push(
      `可行动比例 ${actionableFraction.toFixed(2)} < ${minFrac}（提前知道未转化）`,
    );
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push('提前知道确实增加了有效行动窗口');
  }

  return {
    schemaId: ACTIONABLE_LEAD_TIME_SCHEMA,
    version: 1,
    scenarioId: input.scenarioId,
    n,
    avgPredictedLeadHours,
    avgUsableWindowHours,
    avgControlWindowHours,
    avgLeadGainHours,
    actedInWindowRate,
    actionableFraction,
    passed,
    reasonsZh,
  };
}
