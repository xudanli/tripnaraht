/**
 * Slice 4 Shadow Observation — full catalog adjudication (30 samples).
 */

import { buildAttentionShadowObservationCatalog } from '../attention/attention-shadow-observation-catalog';
import { runAttentionShadowObservation } from '../attention/attention-shadow-observation-runner.util';
import { adjudicateShadowSample } from '../attention/attention-shadow-adjudication.util';
import { runAttentionShadowProjection } from '../attention/attention-shadow-run.util';
import {
  OBS_CONTEXT,
  OBS_EPISODE_AM,
  OBS_EPISODE_PM,
  OBS_TIMES,
  OBS_TRIP_ID,
  obsInfeasibleRow,
  obsWindRow,
} from '../attention/attention-shadow-observation-samples.util';

describe('attention-shadow-observation harness', () => {
  const prevFlag = process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION;

  beforeEach(() => {
    process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION = '1';
  });

  afterEach(() => {
    if (prevFlag === undefined) delete process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION;
    else process.env.ATTENTION_ROOT_CAUSE_ORCHESTRATION = prevFlag;
  });

  it('catalog has 20 deterministic + 10 staging replay samples', () => {
    const catalog = buildAttentionShadowObservationCatalog();
    expect(catalog).toHaveLength(30);
    expect(catalog.filter((c) => c.source === 'DETERMINISTIC_DRILL')).toHaveLength(20);
    expect(catalog.filter((c) => c.source === 'STAGING_REPLAY')).toHaveLength(10);
  });

  it('all catalog samples adjudicate without throw', () => {
    const catalog = buildAttentionShadowObservationCatalog();
    for (const sample of catalog) {
      const output = runAttentionShadowProjection({
        tripId: sample.tripId,
        rows: sample.rows,
        source: sample.source,
        contextOverrides: sample.contextOverrides,
        lineageOverlay: sample.lineageOverlay,
      });
      const result = adjudicateShadowSample(sample.spec, output);
      expect(result.sampleId).toBe(sample.spec.sampleId);
    }
  });

  it('DET-CS-03 missing episode → default no merge (2 clusters)', () => {
    const sample = buildAttentionShadowObservationCatalog().find(
      (c) => c.spec.sampleId === 'DET-CS-03',
    )!;
    const output = runAttentionShadowProjection({
      tripId: sample.tripId,
      rows: sample.rows,
      source: sample.source,
      contextOverrides: sample.contextOverrides,
      lineageOverlay: sample.lineageOverlay,
    });
    const result = adjudicateShadowSample(sample.spec, output);
    expect(output.shadowClusters.length).toBeGreaterThanOrEqual(2);
    expect(result.pass).toBe(true);
  });

  it('DET-CS-02 two wind episodes → 2 clusters', () => {
    const sample = buildAttentionShadowObservationCatalog().find(
      (c) => c.spec.sampleId === 'DET-CS-02',
    )!;
    const output = runAttentionShadowProjection({
      tripId: sample.tripId,
      rows: sample.rows,
      source: sample.source,
      contextOverrides: sample.contextOverrides,
      lineageOverlay: sample.lineageOverlay,
    });
    expect(output.shadowClusters.filter((c) => c.status === 'OPEN')).toHaveLength(2);
    const result = adjudicateShadowSample(sample.spec, output);
    expect(result.pass).toBe(true);
  });

  it('episode authority: without lineage, wind + infeasible stay separate', () => {
    const output = runAttentionShadowProjection({
      tripId: OBS_TRIP_ID,
      rows: [
        obsWindRow({ problemId: 'ep_wind', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
        obsInfeasibleRow({ problemId: 'ep_inf', observedAt: OBS_TIMES.T10 }),
      ],
      source: 'DETERMINISTIC_DRILL',
      contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T10 },
      lineageOverlay: [{ problemId: 'ep_wind', weatherEpisodeId: OBS_EPISODE_AM }],
    });
    expect(output.shadowClusters.length).toBeGreaterThanOrEqual(2);
  });

  it('episode authority: two episodes same segment → separate clusters', () => {
    const output = runAttentionShadowProjection({
      tripId: OBS_TRIP_ID,
      rows: [
        obsWindRow({ problemId: 'ep_a', episodeId: OBS_EPISODE_AM, observedAt: OBS_TIMES.T09 }),
        obsWindRow({ problemId: 'ep_b', episodeId: OBS_EPISODE_PM, observedAt: OBS_TIMES.T16 }),
      ],
      source: 'DETERMINISTIC_DRILL',
      contextOverrides: { ...OBS_CONTEXT, now: OBS_TIMES.T16 },
      lineageOverlay: [
        { problemId: 'ep_a', weatherEpisodeId: OBS_EPISODE_AM },
        { problemId: 'ep_b', weatherEpisodeId: OBS_EPISODE_PM },
      ],
    });
    expect(output.shadowClusters.filter((c) => c.status === 'OPEN')).toHaveLength(2);
  });

  it('observation runner produces summary with rates', () => {
    const summary = runAttentionShadowObservation({ commitSha: 'test-sha' });
    expect(summary.sampleCount).toBe(30);
    expect(summary.rates.sampleCount).toBe(30);
    expect(summary.exitCriteria.falseMergeRate.pass).toBe(true);
    expect(summary.rates.duplicateReductionRate).toBeGreaterThan(0);
  });

  it('priority failure count is zero on catalog', () => {
    const summary = runAttentionShadowObservation();
    const priority = summary.adjudicationResults.filter((r) => r.priorityFailure);
    expect(priority).toHaveLength(0);
  });
});
