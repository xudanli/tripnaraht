/**
 * Phase 5 — Validation metrics (Useful / Accept / FP / Regret).
 * 禁止把「触发次数」当成功指标。
 */

import type { ProactiveDecisionDatasetRecordV1 } from './proactive-decision-dataset.types';
import type { ProactiveTelemetryEventV1 } from '../telemetry/proactive-telemetry.util';
import {
  computeProactiveAcceptRate,
  reduceProactiveTelemetryCounters,
} from '../telemetry/proactive-telemetry.util';

export const PROACTIVE_VALIDATION_METRICS_SCHEMA =
  'nara.proactive_validation_metrics@v1' as const;

export type ProactiveValidationMetricsV1 = {
  schemaId: typeof PROACTIVE_VALIDATION_METRICS_SCHEMA;
  version: 1;
  sampleSize: number;
  visibleShown: number;
  /** G2 */
  usefulInterventionRate: number | null;
  useful: number;
  notUseful: number;
  /** G3 */
  acceptRate: number | null;
  accepted: number;
  /** Noise proxy */
  falsePositiveRate: number | null;
  deferred: number;
  /** G3 long-term proxy — null until regret labels exist */
  regretReduction: number | null;
  regretReported: number;
  /** G1 proxy from dataset: impact==true among wouldNotify */
  impactPrecisionProxy: number | null;
  wouldNotify: number;
  silent: number;
  notesZh: string[];
};

export function computeProactiveValidationMetrics(input: {
  dataset: ProactiveDecisionDatasetRecordV1[];
  telemetry?: ProactiveTelemetryEventV1[];
}): ProactiveValidationMetricsV1 {
  const notesZh: string[] = [];
  const ds = input.dataset;

  let useful = 0;
  let notUseful = 0;
  let accepted = 0;
  let deferred = 0;
  let regretReported = 0;
  let visibleShown = 0;
  let wouldNotify = 0;
  let silent = 0;
  let impactTrueWhenNotify = 0;

  for (const r of ds) {
    if (r.wouldNotify) {
      wouldNotify += 1;
      if (r.impact) impactTrueWhenNotify += 1;
    } else if (r.outcome === 'SILENT_OK' || r.outcome === 'SILENT_MISS') {
      silent += 1;
    }

    if (r.userVisible) visibleShown += 1;

    if (r.userAction === 'FEEDBACK_USEFUL' || r.outcome === 'USEFUL') {
      useful += 1;
    }
    if (r.userAction === 'FEEDBACK_NOT_USEFUL' || r.outcome === 'NOT_USEFUL') {
      notUseful += 1;
    }
    if (
      r.userAction === 'CONFIRM' ||
      r.userAction === 'APPLY' ||
      r.outcome === 'ACCEPTED'
    ) {
      accepted += 1;
    }
    if (r.userAction === 'DEFER' || r.outcome === 'DEFERRED') {
      deferred += 1;
    }
    if (r.outcome === 'REGRET_REPORTED') {
      regretReported += 1;
    }
  }

  // Telemetry supplement for shown/accept when dataset sparse
  if (input.telemetry?.length) {
    const c = reduceProactiveTelemetryCounters(input.telemetry);
    if (visibleShown === 0 && c.shown > 0) {
      visibleShown = c.shown;
      notesZh.push('visibleShown 由 telemetry CARD_SHOWN 补充');
    }
    if (accepted === 0 && c.accepted > 0) {
      accepted = c.accepted;
      notesZh.push('accepted 由 telemetry CONFIRM/APPLY 补充');
    }
    if (useful === 0 && c.useful > 0) useful = c.useful;
    if (notUseful === 0 && c.notUseful > 0) notUseful = c.notUseful;
  }

  const feedbackTotal = useful + notUseful;
  const usefulInterventionRate =
    feedbackTotal > 0 ? useful / feedbackTotal : null;

  const acceptRate =
    visibleShown > 0
      ? accepted / visibleShown
      : input.telemetry
        ? computeProactiveAcceptRate(
            reduceProactiveTelemetryCounters(input.telemetry),
          )
        : null;

  const falsePositiveRate =
    visibleShown > 0
      ? notUseful > 0
        ? notUseful / visibleShown
        : deferred / visibleShown
      : null;

  const regretReduction =
    visibleShown > 0 || wouldNotify > 0
      ? regretReported === 0 && (visibleShown > 0 || wouldNotify > 0)
        ? null // insufficient labeled regret sample
        : 1 - regretReported / Math.max(visibleShown, wouldNotify, 1)
      : null;

  if (regretReduction == null) {
    notesZh.push('Regret Reduction 需 REGRET_REPORTED 标注后才可算');
  }

  const impactPrecisionProxy =
    wouldNotify > 0 ? impactTrueWhenNotify / wouldNotify : null;

  return {
    schemaId: PROACTIVE_VALIDATION_METRICS_SCHEMA,
    version: 1,
    sampleSize: ds.length,
    visibleShown,
    usefulInterventionRate,
    useful,
    notUseful,
    acceptRate,
    accepted,
    falsePositiveRate,
    deferred,
    regretReduction,
    regretReported,
    impactPrecisionProxy,
    wouldNotify,
    silent,
    notesZh,
  };
}
