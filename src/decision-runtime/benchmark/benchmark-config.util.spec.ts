import {
  buildRunConfig,
  detectConfigDrift,
  hashDataset,
  hashRunConfig,
  stableRequestId,
} from './benchmark-config.util';
import { buildBenchmarkDatasetV1 } from './benchmark-dataset-v1';

describe('benchmark-config.util', () => {
  const dataset = buildBenchmarkDatasetV1();

  it('produces stable dataset checksum', () => {
    const a = hashDataset(dataset);
    const b = hashDataset(buildBenchmarkDatasetV1());
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it('produces stable requestId for same inputs', () => {
    const id = stableRequestId({
      benchmarkRunId: 'bench_abc',
      instanceId: 'TD-001',
      seed: 0,
      strategyVariant: 'default',
    });
    expect(id).toHaveLength(32);
    expect(id).toBe(
      stableRequestId({
        benchmarkRunId: 'bench_abc',
        instanceId: 'TD-001',
        seed: 0,
        strategyVariant: 'default',
      }),
    );
  });

  it('detects dataset drift on resume', () => {
    const config = buildRunConfig({
      dataset,
      split: 'CALIBRATION',
      baseUrl: 'http://localhost:3001/api',
      concurrency: 1,
      maxAttempts: 3,
      shadowWaitTimeoutMs: 120_000,
    });
    const drift = detectConfigDrift({
      frozen: config,
      frozenConfigHash: hashRunConfig(config),
      current: { ...config, datasetChecksum: 'deadbeef'.repeat(8) },
      currentDatasetChecksum: 'deadbeef'.repeat(8),
    });
    expect(drift.drifted).toBe(true);
    expect(drift.code).toBe('DATASET_DRIFT_DETECTED');
  });

  it('detects config drift when git commit changes', () => {
    const config = buildRunConfig({
      dataset,
      split: 'ALL',
      baseUrl: 'http://localhost:3001/api',
      concurrency: 1,
      maxAttempts: 3,
      shadowWaitTimeoutMs: 120_000,
    });
    const frozenHash = hashRunConfig(config);
    const current = { ...config, gitCommit: 'different-commit' };
    const drift = detectConfigDrift({
      frozen: config,
      frozenConfigHash: frozenHash,
      current,
      currentDatasetChecksum: config.datasetChecksum,
    });
    expect(drift.drifted).toBe(true);
    expect(drift.code).toBe('CONFIG_DRIFT_DETECTED');
    expect(drift.details.some((d) => d.includes('gitCommit'))).toBe(true);
  });

  it('allows drift when fork explicitly permitted', () => {
    const config = buildRunConfig({
      dataset,
      split: 'ALL',
      baseUrl: 'http://localhost:3001/api',
      concurrency: 1,
      maxAttempts: 3,
      shadowWaitTimeoutMs: 120_000,
    });
    const current = { ...config, gitCommit: 'fork-commit' };
    const drift = detectConfigDrift({
      frozen: config,
      frozenConfigHash: hashRunConfig(config),
      current,
      currentDatasetChecksum: config.datasetChecksum,
      allowFork: true,
    });
    expect(drift.drifted).toBe(false);
  });
});
