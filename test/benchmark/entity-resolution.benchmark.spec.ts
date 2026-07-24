/**
 * Week 3.2 — Entity Resolution 模糊 Query Golden Set 基线基准。
 *
 * 运行：npx jest test/benchmark/entity-resolution.benchmark.spec.ts
 */

import { RedisEntityResolutionProvider } from '../../src/agent/providers/redis-entity-resolution.provider';
import { VectorEntityResolutionProvider } from '../../src/agent/providers/vector-entity-resolution.provider';
import {
  ENTITY_RESOLUTION_GOLDEN_SET,
  GOLDEN_SET_BASELINE_THRESHOLDS,
} from '../fixtures/query-rewrite/entity-resolution-golden-set';
import { createBenchmarkEmbeddingService } from './entity-resolution-benchmark-embedding.mock';
import {
  assertBenchmarkThresholds,
  formatBenchmarkReport,
  runEntityResolutionGoldenBenchmark,
} from './entity-resolution-benchmark.util';
import { ENTITY_RESOLUTION_PRODUCTION_BASELINE } from '../fixtures/query-rewrite/entity-resolution-production-baseline';

describe('Entity Resolution Vector Pipeline - Golden Set Benchmark', () => {
  let provider: RedisEntityResolutionProvider;

  beforeEach(async () => {
    const embeddingService = createBenchmarkEmbeddingService();
    const vectorEr = new VectorEntityResolutionProvider(embeddingService);
    await vectorEr.onModuleInit();

    provider = new RedisEntityResolutionProvider(undefined, vectorEr);
    await provider.seedFromStaticGraph();
  });

  it('Golden Set 规模符合 Week 3.2 目标（>= 25 cases）', () => {
    expect(ENTITY_RESOLUTION_GOLDEN_SET.length).toBeGreaterThanOrEqual(25);
    const tiers = new Set(ENTITY_RESOLUTION_GOLDEN_SET.map((c) => c.tier));
    expect(tiers.has('core')).toBe(true);
    expect(tiers.has('adversarial')).toBe(true);
  });

  it('应通过 L0→L1→L2 三级粗筛基线红线（memory vector + substring）', async () => {
    const report = await runEntityResolutionGoldenBenchmark(provider, {
      pipelineMode: 'memory-vector+substring-fallback (mock BGE clusters)',
    });

    // eslint-disable-next-line no-console
    console.log(formatBenchmarkReport(report));

    expect(report.total).toBe(ENTITY_RESOLUTION_GOLDEN_SET.length);
    expect(report.byTier.core.accuracy).toBeGreaterThanOrEqual(
      GOLDEN_SET_BASELINE_THRESHOLDS.coreMinAccuracy,
    );
    expect(report.overallAccuracy).toBeGreaterThanOrEqual(
      GOLDEN_SET_BASELINE_THRESHOLDS.overallMinAccuracy,
    );

    assertBenchmarkThresholds(report);
  });

  const qdrantBenchmarkIt = process.env.ER_BENCHMARK_QDRANT ? it : it.skip;
  qdrantBenchmarkIt(
    '生产基线：qdrant-rest + 真实 BGE（ER_BENCHMARK_QDRANT=1）',
    async () => {
      const qdrantUrl = process.env.QDRANT_URL?.trim();
      if (!qdrantUrl) {
        throw new Error('QDRANT_URL 未配置');
      }

      const threshold = Number(
        process.env.VECTOR_ER_SCORE_THRESHOLD ??
          ENTITY_RESOLUTION_PRODUCTION_BASELINE.vectorErScoreThreshold,
      );

      const { ConfigService } = await import('@nestjs/config');
      const { ErQdrantEmbeddingClient } = await import(
        '../../scripts/lib/er-qdrant-embedding.util'
      );
      const client = new ErQdrantEmbeddingClient();
      const embeddingService = {
        generateEmbedding: (text: string) => client.generateEmbedding(text),
      } as import('../../src/places/services/embedding.service').EmbeddingService;

      const config = new ConfigService({
        QDRANT_URL: qdrantUrl,
        VECTOR_ER_SCORE_THRESHOLD: String(threshold),
      });

      const vectorEr = new VectorEntityResolutionProvider(embeddingService, config);
      await vectorEr.onModuleInit();

      const qdrantProvider = new RedisEntityResolutionProvider(undefined, vectorEr);
      await qdrantProvider.seedFromStaticGraph();

      const report = await runEntityResolutionGoldenBenchmark(qdrantProvider, {
        pipelineMode: `qdrant-rest (BGE-M3, threshold=${threshold}, ${qdrantUrl})`,
      });

      // eslint-disable-next-line no-console
      console.log(formatBenchmarkReport(report));
      // eslint-disable-next-line no-console
      console.log(
        `   Locked baseline ref: ${ENTITY_RESOLUTION_PRODUCTION_BASELINE.recordedAt}, seeded=${ENTITY_RESOLUTION_PRODUCTION_BASELINE.seededPoints} pts`,
      );

      assertBenchmarkThresholds(report);

      if (report.byTier.stretch.accuracy < ENTITY_RESOLUTION_PRODUCTION_BASELINE.targets.stretchMinAccuracy) {
        throw new Error(
          `Stretch tier ${(report.byTier.stretch.accuracy * 100).toFixed(2)}% < ${ENTITY_RESOLUTION_PRODUCTION_BASELINE.targets.stretchMinAccuracy * 100}%`,
        );
      }
    },
    120_000,
  );

  it('单独输出失败 case 便于阈值调优', async () => {
    const report = await runEntityResolutionGoldenBenchmark(provider);
    for (const failure of report.failures) {
      // eslint-disable-next-line no-console
      console.warn(
        `[ER-GOLDEN-FAIL] ${failure.case.id} tier=${failure.case.tier} query="${failure.case.query}"`,
      );
    }
    expect(report.failures.length).toBeLessThanOrEqual(
      Math.ceil(report.total * (1 - GOLDEN_SET_BASELINE_THRESHOLDS.overallMinAccuracy)),
    );
  });
});
