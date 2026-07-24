/**
 * Run full Shadow Observation catalog and produce summary + report.
 */

import type {
  AttentionShadowObservationSummary,
  AttentionShadowVerdict,
} from '../contracts/attention-orchestration.types';
import { adjudicateShadowSample, computeObservationRates, evaluateExitCriteria } from './attention-shadow-adjudication.util';
import { buildAttentionShadowObservationCatalog } from './attention-shadow-observation-catalog';
import { runAttentionShadowProjection, shadowOccurrence } from './attention-shadow-run.util';
import { renderAttentionShadowObservationReport } from './attention-shadow-observation-report.util';

export interface AttentionShadowObservationRunOptions {
  commitSha?: string;
  featureFlag?: string;
  writeEvidence?: boolean;
  evidenceWriter?: (evidence: import('../contracts/attention-orchestration.types').AttentionShadowEvidence) => string;
}

export function runAttentionShadowObservation(
  opts: AttentionShadowObservationRunOptions = {},
): AttentionShadowObservationSummary {
  const catalog = buildAttentionShadowObservationCatalog();
  const adjudicationResults = [];
  let legacyVisibleTotal = 0;
  let duplicateReductionTotal = 0;
  let resolutionPassCount = 0;
  let resolutionSampleCount = 0;
  let preservedCount = 0;
  let repeatedPollingDuplicates = 0;

  for (const sample of catalog) {
    const output = runAttentionShadowProjection({
      tripId: sample.tripId,
      rows: sample.rows,
      source: sample.source,
      contextOverrides: sample.contextOverrides,
      lineageOverlay: sample.lineageOverlay,
      sampleId: sample.spec.sampleId,
      sampleGroup: sample.spec.group,
    });

    legacyVisibleTotal += output.legacyVisible.length;
    duplicateReductionTotal += Math.max(
      0,
      output.legacyVisible.length - output.shadowPrimaryItems.length,
    );

    if (sample.spec.group === 'RESOLUTION_REPLAY') {
      resolutionSampleCount += 1;
      if (sample.spec.expectedResolutionBehavior === 'REMOVE_FROM_VISIBLE') {
        if (output.shadowPrimaryItems.length === 0) resolutionPassCount += 1;
      } else if (sample.spec.expectedResolutionBehavior === 'NO_DUPLICATE_ON_POLL') {
        const replay = runAttentionShadowProjection({
          tripId: sample.tripId,
          rows: sample.rows.map((r) => ({
            ...r,
            occurrences: [shadowOccurrence(new Date().toISOString())],
          })),
          source: sample.source,
          contextOverrides: sample.contextOverrides,
          lineageOverlay: sample.lineageOverlay,
        });
        if (replay.shadowPrimaryItems.length === output.shadowPrimaryItems.length) {
          resolutionPassCount += 1;
        } else {
          repeatedPollingDuplicates += 1;
        }
      } else {
        resolutionPassCount += 1;
      }
    }

    if (output.inputProblems.length >= sample.rows.filter((r) =>
      !['ROAD_SEGMENT_UNAVAILABLE', 'ROAD_CLOSED'].includes(r.semanticKey),
    ).length) {
      preservedCount += 1;
    }

    adjudicationResults.push(adjudicateShadowSample(sample.spec, output));

    if (opts.writeEvidence && opts.evidenceWriter) {
      opts.evidenceWriter({
        schemaId: 'tripnara.attention_shadow_evidence@v1',
        tripId: sample.tripId,
        runAt: new Date().toISOString(),
        source: sample.source,
        sampleId: sample.spec.sampleId,
        sampleGroup: sample.spec.group,
        inputProblems: output.inputProblems,
        legacyProjection: output.legacyVisible,
        shadowClusters: output.shadowClusters,
        shadowPrimaryItems: output.shadowPrimaryItems,
        comparison: output.comparison,
        metricsSnapshot: {},
      });
    }
  }

  const deterministicCount = catalog.filter((c) => c.source === 'DETERMINISTIC_DRILL').length;
  const stagingReplayCount = catalog.filter((c) => c.source === 'STAGING_REPLAY').length;

  const rates = computeObservationRates({
    results: adjudicationResults,
    deterministicCount,
    stagingReplayCount,
    duplicateReductionTotal,
    legacyVisibleTotal,
    resolutionPassCount,
    resolutionSampleCount,
    preservedCount,
  });

  const exitCriteria = evaluateExitCriteria(rates, { repeatedPollingDuplicates });
  const allExitPass = Object.values(exitCriteria).every((c) => c.pass);
  const noPriorityFailures = adjudicationResults.every((r) => !r.priorityFailure);

  const verdictCounts: Partial<Record<AttentionShadowVerdict, number>> = {};
  for (const r of adjudicationResults) {
    verdictCounts[r.actual.verdict] = (verdictCounts[r.actual.verdict] ?? 0) + 1;
  }

  return {
    schemaId: 'tripnara.attention_shadow_observation_summary@v1',
    generatedAt: new Date().toISOString(),
    commitSha: opts.commitSha,
    featureFlag: opts.featureFlag ?? 'ATTENTION_ROOT_CAUSE_ORCHESTRATION=1',
    sampleCount: catalog.length,
    deterministicCount,
    stagingReplayCount,
    verdictCounts,
    adjudicationResults,
    rates,
    exitCriteria,
    goNoGo: allExitPass && noPriorityFailures ? 'GO' : 'PENDING',
  };
}

export function runObservationAndRenderReport(opts: AttentionShadowObservationRunOptions = {}): {
  summary: AttentionShadowObservationSummary;
  markdown: string;
} {
  const summary = runAttentionShadowObservation(opts);
  const markdown = renderAttentionShadowObservationReport(summary);
  return { summary, markdown };
}
