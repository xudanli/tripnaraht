/**
 * Aggregate Shadow Canary observations for Stage 0 dashboards.
 */

import type { ProactiveDecisionCaseId } from '../contracts/proactive-decision-case.types';
import type {
  ProactiveShadowObservationV1,
  ProactiveShadowSummaryV1,
} from './proactive-shadow-observation.types';

export function summarizeProactiveShadowObservations(
  observations: ProactiveShadowObservationV1[],
): ProactiveShadowSummaryV1 {
  let wouldNotifyCount = 0;
  let wouldSilentCount = 0;
  let noDecisionCount = 0;
  const notifyValues: number[] = [];
  const qualityScores: number[] = [];
  const byCase: ProactiveShadowSummaryV1['byCase'] = {};

  for (const o of observations) {
    if (o.wouldNotify === 'WOULD_NOTIFY') {
      wouldNotifyCount += 1;
      if (o.interventionValue != null) notifyValues.push(o.interventionValue);
    } else if (o.wouldNotify === 'WOULD_SILENT') {
      wouldSilentCount += 1;
    } else {
      noDecisionCount += 1;
    }
    qualityScores.push(o.quality.score);

    if (o.caseId) {
      const bucket = byCase[o.caseId] ?? {
        runs: 0,
        wouldNotify: 0,
        meanQuality: null as number | null,
      };
      bucket.runs += 1;
      if (o.wouldNotify === 'WOULD_NOTIFY') bucket.wouldNotify += 1;
      byCase[o.caseId] = bucket;
    }
  }

  for (const caseId of Object.keys(byCase) as ProactiveDecisionCaseId[]) {
    const bucket = byCase[caseId]!;
    const caseObs = observations.filter((o) => o.caseId === caseId);
    const scores = caseObs.map((o) => o.quality.score);
    bucket.meanQuality =
      scores.length > 0
        ? scores.reduce((a, b) => a + b, 0) / scores.length
        : null;
  }

  const totalRuns = observations.length;
  return {
    schemaId: 'nara.proactive_shadow_summary@v1',
    version: 1,
    totalRuns,
    wouldNotifyCount,
    wouldSilentCount,
    noDecisionCount,
    wouldNotifyRate: totalRuns > 0 ? wouldNotifyCount / totalRuns : null,
    meanInterventionValueWhenNotify:
      notifyValues.length > 0
        ? notifyValues.reduce((a, b) => a + b, 0) / notifyValues.length
        : null,
    meanQualityScore:
      qualityScores.length > 0
        ? qualityScores.reduce((a, b) => a + b, 0) / qualityScores.length
        : null,
    byCase,
  };
}
