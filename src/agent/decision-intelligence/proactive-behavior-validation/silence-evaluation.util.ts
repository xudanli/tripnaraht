/**
 * SilenceEvaluation — 同时评价 Surface 与 Suppression。
 * 避免过度提醒与过度沉默。Useful Surface ≠ Sustainable Proactive Experience。
 */

import type { ProactiveBehaviorObservationV1 } from './proactive-behavior-observation.util';

export const SILENCE_EVALUATION_SCHEMA = 'nara.silence_evaluation@v1' as const;

export type SilenceEvaluationV1 = {
  schemaId: typeof SILENCE_EVALUATION_SCHEMA;
  version: 1;
  tripId: string;
  dayKey?: string;
  surfaceN: number;
  suppressN: number;
  overReminderRate: number;
  overSilenceRate: number;
  correctSilenceRate: number;
  silenceQualityScore: number;
  passed: boolean;
  reasonsZh: string[];
  usefulSurfaceIsNotSustainableExperience: true;
};

export function evaluateSilenceQuality(input: {
  tripId: string;
  observations: ProactiveBehaviorObservationV1[];
  dayKey?: string;
  maxOverReminderRate?: number;
  maxOverSilenceRate?: number;
  minSilenceQuality?: number;
}): SilenceEvaluationV1 {
  let rows = input.observations.filter((o) => o.tripId === input.tripId);
  if (input.dayKey) {
    rows = rows.filter((o) => o.dayKey === input.dayKey);
  }

  const surfaced = rows.filter((o) => o.surfaced);
  const suppressed = rows.filter((o) => !o.surfaced);
  const surfaceN = surfaced.length;
  const suppressN = suppressed.length;

  const overReminderRate =
    surfaceN === 0
      ? 0
      : surfaced.filter(
          (o) =>
            o.kind === 'UNNECESSARY' ||
            o.kind === 'DISMISS' ||
            o.kind === 'REPEATED_IGNORE' ||
            o.kind === 'INTERVENTION_REGRET',
        ).length / surfaceN;

  const overSilenceRate =
    suppressN === 0
      ? 0
      : suppressed.filter((o) => o.kind === 'SUPPRESSED_MISSED').length /
        suppressN;

  const correctSilenceRate =
    suppressN === 0
      ? 1
      : suppressed.filter((o) => o.kind === 'SUPPRESSED_CORRECT').length /
        suppressN;

  const silenceQualityScore = Math.max(
    0,
    Math.min(
      1,
      0.55 +
        correctSilenceRate * 0.3 -
        overReminderRate * 0.35 -
        overSilenceRate * 0.3,
    ),
  );

  const reasonsZh: string[] = [];
  if (overReminderRate > (input.maxOverReminderRate ?? 0.3)) {
    reasonsZh.push(`过度提醒率 ${overReminderRate.toFixed(2)} 过高`);
  }
  if (overSilenceRate > (input.maxOverSilenceRate ?? 0.35)) {
    reasonsZh.push(`过度沉默率 ${overSilenceRate.toFixed(2)} 过高`);
  }
  if (silenceQualityScore < (input.minSilenceQuality ?? 0.5)) {
    reasonsZh.push(
      `Silence Quality ${silenceQualityScore.toFixed(2)} 不足（可持续主动体验未达标）`,
    );
  }

  const passed = reasonsZh.length === 0;
  if (passed) {
    reasonsZh.push(
      'SilenceEvaluation 通过：既不过度提醒也不过度沉默',
    );
  }

  return {
    schemaId: SILENCE_EVALUATION_SCHEMA,
    version: 1,
    tripId: input.tripId,
    dayKey: input.dayKey,
    surfaceN,
    suppressN,
    overReminderRate,
    overSilenceRate,
    correctSilenceRate,
    silenceQualityScore,
    passed,
    reasonsZh,
    usefulSurfaceIsNotSustainableExperience: true,
  };
}
