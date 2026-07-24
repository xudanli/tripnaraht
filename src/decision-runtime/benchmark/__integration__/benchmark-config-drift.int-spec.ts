/**
 * Config/dataset drift + fork-from fault injection.
 */

import { detectConfigDrift, hashRunConfig, buildRunConfig } from '../benchmark-config.util';
import {
  INTEGRATION_INSTANCES,
  TEST_RUN_PREFIX,
  type BenchmarkTestHarness,
} from './benchmark-test.harness';
import { newBenchmarkRunId } from '../benchmark-run.store';
import {
  setupBenchmarkIntegration,
  assertIntegrationReady,
  type BenchmarkIntegrationContext,
} from './benchmark-integration.guard';

describe('E1 fault injection — config drift', () => {
  let ctx: BenchmarkIntegrationContext;

  beforeAll(async () => {
    ctx = await setupBenchmarkIntegration();
  });

  afterAll(async () => {
    await ctx.harness?.dispose();
  });

  it('allows resume when frozen config matches', () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const drift = detectConfigDrift({
        frozen: h.baseConfig,
        frozenConfigHash: hashRunConfig(h.baseConfig),
        current: h.baseConfig,
        currentDatasetChecksum: h.baseConfig.datasetChecksum,
      });
      expect(drift.drifted).toBe(false);
    });

  it('rejects resume on dataset checksum drift', () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const drift = detectConfigDrift({
        frozen: h.baseConfig,
        frozenConfigHash: hashRunConfig(h.baseConfig),
        current: { ...h.baseConfig, datasetChecksum: 'deadbeef'.repeat(8) },
        currentDatasetChecksum: 'deadbeef'.repeat(8),
      });
      expect(drift.drifted).toBe(true);
      expect(drift.code).toBe('DATASET_DRIFT_DETECTED');
    });

  it('rejects resume on git commit drift', () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const current = { ...h.baseConfig, gitCommit: 'different-sha' };
      const drift = detectConfigDrift({
        frozen: h.baseConfig,
        frozenConfigHash: hashRunConfig(h.baseConfig),
        current,
        currentDatasetChecksum: h.baseConfig.datasetChecksum,
      });
      expect(drift.drifted).toBe(true);
      expect(drift.code).toBe('CONFIG_DRIFT_DETECTED');
      expect(drift.details.some((d) => d.includes('gitCommit'))).toBe(true);
    });

  it('rejects resume on objective registry drift', () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const current = { ...h.baseConfig, objectiveRegistryVersion: 'objective@v999' };
      const drift = detectConfigDrift({
        frozen: h.baseConfig,
        frozenConfigHash: hashRunConfig(h.baseConfig),
        current,
        currentDatasetChecksum: h.baseConfig.datasetChecksum,
      });
      expect(drift.code).toBe('CONFIG_DRIFT_DETECTED');
    });

  it('drift gate blocks resume before any new work starts', () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const mutated = buildRunConfig({
        dataset: h.dataset,
        split: 'CALIBRATION',
        baseUrl: h.baseConfig.baseUrl,
        concurrency: 1,
        maxAttempts: 3,
        shadowWaitTimeoutMs: 5_000,
      });
      const drift = detectConfigDrift({
        frozen: h.baseConfig,
        frozenConfigHash: hashRunConfig(h.baseConfig),
        current: { ...mutated, solverEngine: 'different-engine' },
        currentDatasetChecksum: h.baseConfig.datasetChecksum,
      });
      expect(drift.drifted).toBe(true);
      expect(drift.code).toBe('CONFIG_DRIFT_DETECTED');
    });

  it('fork-from creates new run id and execution records', async () => {
    assertIntegrationReady(ctx);
    const h = ctx.harness;
      const parentInst = INTEGRATION_INSTANCES[0];
      const { benchmarkRunId: parentRunId } = await h.createRun([parentInst]);

      const forkRunId = `${TEST_RUN_PREFIX}fork_${newBenchmarkRunId().replace(/^bench_/, '')}`;
      const forkConfig = { ...h.baseConfig };
      const fork = await h.store.createRun({
        benchmarkRunId: forkRunId,
        config: forkConfig,
        instances: [parentInst],
        forkedFromRunId: parentRunId,
      });

      expect(fork.forkedFromRunId).toBe(parentRunId);
      expect(fork.benchmarkRunId).not.toBe(parentRunId);

      const parentRows = await h.store.listInstances(parentRunId);
      const forkRows = await h.store.listInstances(forkRunId);
      expect(forkRows[0].id).not.toBe(parentRows[0].id);
      expect(forkRows[0].requestId).not.toBe(parentRows[0].requestId);
  });
});
