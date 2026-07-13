/**
 * Staging replay evidence builder — schema + catalog wiring (no live DB).
 */

import { buildAttentionShadowObservationCatalog } from '../attention/attention-shadow-observation-catalog';
import { STAGING_REAL_DB_REPLAY_CATALOG } from '../attention/attention-shadow-staging-replay-catalog';
import { buildStagingReplayEvidence } from '../attention/attention-shadow-staging-replay.util';
import { runAttentionShadowProjection } from '../attention/attention-shadow-run.util';

describe('Attention Shadow Staging Replay harness', () => {
  it('STG-R1: real-DB catalog has 10 scenarios A–F + authority edge cases', () => {
    expect(STAGING_REAL_DB_REPLAY_CATALOG.length).toBeGreaterThanOrEqual(10);
    const ids = STAGING_REAL_DB_REPLAY_CATALOG.map((s) => s.scenarioId);
    expect(ids).toContain('STG-REPLAY-A');
    expect(ids).toContain('STG-REPLAY-F');
    expect(ids).toContain('STG-REPLAY-E');
  });

  it('STG-R2: enriched evidence schema includes audit trail fields', () => {
    const fixtureCase = buildAttentionShadowObservationCatalog().find(
      (c) => c.spec.sampleId === 'STG-02',
    );
    expect(fixtureCase).toBeDefined();

    const spec = STAGING_REAL_DB_REPLAY_CATALOG.find((s) => s.scenarioId === 'STG-REPLAY-B')!;
    const output = runAttentionShadowProjection({
      tripId: fixtureCase!.tripId,
      rows: fixtureCase!.rows,
      source: 'STAGING_REPLAY',
      lineageOverlay: fixtureCase!.lineageOverlay,
      contextOverrides: fixtureCase!.contextOverrides,
    });
    const evidence = buildStagingReplayEvidence({
      spec,
      rows: fixtureCase!.rows,
      output,
      commitSha: 'test-sha',
    });

    expect(evidence.schemaId).toBe('tripnara.attention_shadow_staging_replay@v1');
    expect(evidence.commitSha).toBe('test-sha');
    expect(evidence.inputRows.length).toBeGreaterThan(0);
    expect(evidence.normalizedInputs.length).toBeGreaterThan(0);
    expect(evidence.normalizedInputs[0]).toMatchObject({
      problemId: expect.any(String),
      semanticCapability: expect.any(String),
      episodeSource: expect.stringMatching(/ROW|LINEAGE|CONTEXT|MISSING/),
      mergeAuthority: expect.any(Boolean),
    });
    expect(evidence.comparison.primarySelectionReason).toContain('selected');
    expect(evidence.comparison.attentionReason).toContain('attention=');
    expect(evidence.humanAdjudication?.shouldMerge).toBe('PENDING');
  });

  it('STG-R3: repeat projection does not increase cluster or visible counts', () => {
    const fixtureCase = buildAttentionShadowObservationCatalog().find(
      (c) => c.spec.sampleId === 'STG-07',
    )!;
    const first = runAttentionShadowProjection({
      tripId: fixtureCase.tripId,
      rows: fixtureCase.rows,
      source: 'STAGING_REPLAY',
      lineageOverlay: fixtureCase.lineageOverlay,
      contextOverrides: fixtureCase.contextOverrides,
    });
    const second = runAttentionShadowProjection({
      tripId: fixtureCase.tripId,
      rows: fixtureCase.rows,
      source: 'STAGING_REPLAY',
      lineageOverlay: fixtureCase.lineageOverlay,
      contextOverrides: fixtureCase.contextOverrides,
    });

    const openClusters = (o: typeof first) =>
      o.shadowClusters.filter((c) => c.status === 'OPEN').length;

    expect(openClusters(second)).toBe(openClusters(first));
    expect(second.shadowPrimaryItems.length).toBe(first.shadowPrimaryItems.length);
  });
});
