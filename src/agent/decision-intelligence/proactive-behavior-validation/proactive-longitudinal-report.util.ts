/**
 * Proactive Longitudinal Report — Trip / Day 级长期 Attention Quality。
 * DoD：完整旅行周期高价值、低打扰，用户愿意长期保留主动关系。
 */

import type { TemporalScenarioId } from '../pilot/scenario-temporal-readiness.util';
import type { ProactiveBehaviorObservationV1 } from './proactive-behavior-observation.util';
import {
  evaluateSilenceQuality,
  type SilenceEvaluationV1,
} from './silence-evaluation.util';

export const PROACTIVE_LONGITUDINAL_REPORT_SCHEMA =
  'nara.proactive_longitudinal_report@v1' as const;

export type DayAttentionRowV1 = {
  dayKey: string;
  surfaceN: number;
  usefulRate: number;
  dismissRate: number;
  snoozeRate: number;
  repeatedIgnoreRate: number;
  regretRate: number;
  silence: SilenceEvaluationV1;
  attentionQuality: number;
};

export type ProactiveLongitudinalReportV1 = {
  schemaId: typeof PROACTIVE_LONGITUDINAL_REPORT_SCHEMA;
  version: 1;
  tripId: string;
  scenarioId: TemporalScenarioId;
  dayRows: DayAttentionRowV1[];
  tripAttentionQuality: number;
  tripSilenceQuality: number;
  usefulRate: number;
  unnecessaryRate: number;
  dismissRate: number;
  snoozeRate: number;
  repeatedIgnoreRate: number;
  interventionRegretRate: number;
  /** 用户愿意长期保留主动关系的代理指标 */
  retentionWillingnessScore: number;
  sustainable: boolean;
  reasonsZh: string[];
  usefulSurfaceIsNotSustainableExperience: true;
  dodFocusZh: string;
};

function rateOf(
  rows: ProactiveBehaviorObservationV1[],
  kind: ProactiveBehaviorObservationV1['kind'],
): number {
  const surfaced = rows.filter((r) => r.surfaced);
  if (surfaced.length === 0) return 0;
  return surfaced.filter((r) => r.kind === kind).length / surfaced.length;
}

export function buildProactiveLongitudinalReport(input: {
  tripId: string;
  scenarioId: TemporalScenarioId;
  observations: ProactiveBehaviorObservationV1[];
  minDays?: number;
  minTripAttentionQuality?: number;
  maxRegretRate?: number;
  minRetentionWillingness?: number;
}): ProactiveLongitudinalReportV1 {
  const scoped = input.observations.filter(
    (o) => o.tripId === input.tripId && o.scenarioId === input.scenarioId,
  );
  const dayKeys = [...new Set(scoped.map((o) => o.dayKey))].sort();
  const dayRows: DayAttentionRowV1[] = dayKeys.map((dayKey) => {
    const dayObs = scoped.filter((o) => o.dayKey === dayKey);
    const surfaced = dayObs.filter((o) => o.surfaced);
    const silence = evaluateSilenceQuality({
      tripId: input.tripId,
      dayKey,
      observations: dayObs,
    });
    const usefulRate = rateOf(dayObs, 'USEFUL');
    const dismissRate = rateOf(dayObs, 'DISMISS');
    const snoozeRate = rateOf(dayObs, 'SNOOZE');
    const repeatedIgnoreRate = rateOf(dayObs, 'REPEATED_IGNORE');
    const regretRate = rateOf(dayObs, 'INTERVENTION_REGRET');
    const attentionQuality = Math.max(
      0,
      Math.min(
        1,
        0.45 +
          usefulRate * 0.35 +
          silence.silenceQualityScore * 0.25 -
          dismissRate * 0.2 -
          repeatedIgnoreRate * 0.25 -
          regretRate * 0.3,
      ),
    );
    return {
      dayKey,
      surfaceN: surfaced.length,
      usefulRate,
      dismissRate,
      snoozeRate,
      repeatedIgnoreRate,
      regretRate,
      silence,
      attentionQuality,
    };
  });

  const tripAttentionQuality =
    dayRows.length === 0
      ? 0
      : dayRows.reduce((s, d) => s + d.attentionQuality, 0) / dayRows.length;

  const tripSilence = evaluateSilenceQuality({
    tripId: input.tripId,
    observations: scoped,
  });

  const usefulRate = rateOf(scoped, 'USEFUL');
  const unnecessaryRate = rateOf(scoped, 'UNNECESSARY');
  const dismissRate = rateOf(scoped, 'DISMISS');
  const snoozeRate = rateOf(scoped, 'SNOOZE');
  const repeatedIgnoreRate = rateOf(scoped, 'REPEATED_IGNORE');
  const interventionRegretRate = rateOf(scoped, 'INTERVENTION_REGRET');

  const retentionWillingnessScore = Math.max(
    0,
    Math.min(
      1,
      tripAttentionQuality * 0.45 +
        tripSilence.silenceQualityScore * 0.35 +
        usefulRate * 0.2 -
        interventionRegretRate * 0.4 -
        repeatedIgnoreRate * 0.25,
    ),
  );

  const reasonsZh: string[] = [];
  const minDays = input.minDays ?? 2;
  if (dayRows.length < minDays) {
    reasonsZh.push(`旅行天数不足 ${dayRows.length} < ${minDays}（需完整周期观察）`);
  }
  if (tripAttentionQuality < (input.minTripAttentionQuality ?? 0.55)) {
    reasonsZh.push(
      `Trip Attention Quality ${tripAttentionQuality.toFixed(2)} 不足`,
    );
  }
  if (!tripSilence.passed) {
    reasonsZh.push(...tripSilence.reasonsZh);
  }
  if (interventionRegretRate > (input.maxRegretRate ?? 0.2)) {
    reasonsZh.push(
      `Intervention Regret ${interventionRegretRate.toFixed(2)} 过高`,
    );
  }
  if (retentionWillingnessScore < (input.minRetentionWillingness ?? 0.55)) {
    reasonsZh.push(
      `长期保留意愿 ${retentionWillingnessScore.toFixed(2)} 不足（非单次有用即可）`,
    );
  }

  const sustainable = reasonsZh.length === 0;
  if (sustainable) {
    reasonsZh.push(
      '纵向报告通过：完整旅行周期高价值、低打扰，用户愿意长期保留主动关系',
    );
  }

  return {
    schemaId: PROACTIVE_LONGITUDINAL_REPORT_SCHEMA,
    version: 1,
    tripId: input.tripId,
    scenarioId: input.scenarioId,
    dayRows,
    tripAttentionQuality,
    tripSilenceQuality: tripSilence.silenceQualityScore,
    usefulRate,
    unnecessaryRate,
    dismissRate,
    snoozeRate,
    repeatedIgnoreRate,
    interventionRegretRate,
    retentionWillingnessScore,
    sustainable,
    reasonsZh,
    usefulSurfaceIsNotSustainableExperience: true,
    dodFocusZh:
      'DoD：不是一条主动提示有用，而是完整旅行周期持续高价值、低打扰，用户愿意长期保留主动关系',
  };
}
