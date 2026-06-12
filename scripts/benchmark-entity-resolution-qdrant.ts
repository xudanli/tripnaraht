#!/usr/bin/env tsx
/**
 * Week 3.1 — 用真实 BGE-M3 + Qdrant 跑 Golden Set 生产基线。
 *
 * 用法：
 *   npm run benchmark:er-golden:qdrant
 *
 * 前置：npm run seed:er-qdrant
 * 环境：QDRANT_URL, PYTHON_AI_SERVICE_URL, VECTOR_ER_SCORE_THRESHOLD (默认 0.55)
 */

import dotenv from 'dotenv';
import { ConfigService } from '@nestjs/config';
import type { EmbeddingService } from '../src/places/services/embedding.service';
import { VectorEntityResolutionProvider } from '../src/agent/providers/vector-entity-resolution.provider';
import { RedisEntityResolutionProvider } from '../src/agent/providers/redis-entity-resolution.provider';
import {
  assertBenchmarkThresholds,
  formatBenchmarkReport,
  runEntityResolutionGoldenBenchmark,
} from '../test/benchmark/entity-resolution-benchmark.util';
import { ErQdrantEmbeddingClient } from './lib/er-qdrant-embedding.util';
import { resolveQdrantBaseUrl } from '../src/agent/utils/qdrant-er-client.util';

dotenv.config();

class StandaloneConfigService extends ConfigService {
  constructor(private readonly values: Record<string, string>) {
    super();
  }

  get<T = string>(key: string): T | undefined {
    return this.values[key] as T | undefined;
  }
}

/** 脚本用轻量 EmbeddingService 适配（直连 Python AI，无需 Nest DI） */
function createScriptEmbeddingService(): EmbeddingService {
  const client = new ErQdrantEmbeddingClient();
  return {
    generateEmbedding: (text: string) => client.generateEmbedding(text),
  } as EmbeddingService;
}

async function main(): Promise<void> {
  const configuredUrl = process.env.QDRANT_URL?.trim();
  const qdrantUrl = await resolveQdrantBaseUrl(configuredUrl);
  if (!qdrantUrl) {
    console.error('❌ 无法连接 Qdrant，请先运行: npm run qdrant:local && npm run seed:er-qdrant');
    process.exit(1);
  }
  if (configuredUrl && configuredUrl !== qdrantUrl) {
    console.log(`ℹ️  QDRANT_URL fallback → ${qdrantUrl}`);
  }

  const config = new StandaloneConfigService({
    QDRANT_URL: qdrantUrl,
    VECTOR_ER_SCORE_THRESHOLD: process.env.VECTOR_ER_SCORE_THRESHOLD ?? '0.55',
    EMBEDDING_PROVIDER: process.env.EMBEDDING_PROVIDER ?? 'python',
    EMBEDDING_DIMENSION: process.env.EMBEDDING_DIMENSION ?? '1024',
    PYTHON_AI_SERVICE_URL: process.env.PYTHON_AI_SERVICE_URL ?? '',
    OPENAI_DISABLE_PROXY: 'true',
  });

  const embeddingService = createScriptEmbeddingService();
  const vectorEr = new VectorEntityResolutionProvider(embeddingService, config);
  await vectorEr.onModuleInit();

  const provider = new RedisEntityResolutionProvider(undefined, vectorEr);
  await provider.seedFromStaticGraph();

  const report = await runEntityResolutionGoldenBenchmark(provider, {
    pipelineMode: `qdrant-rest (BGE-M3, threshold=${config.get('VECTOR_ER_SCORE_THRESHOLD')}, ${qdrantUrl})`,
  });

  console.log(formatBenchmarkReport(report));

  try {
    assertBenchmarkThresholds(report);
    console.log('\n✅ Golden Set 基线通过');
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`\n❌ 基线未达标: ${msg}`);
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('❌ Benchmark 失败:', msg);
  process.exit(1);
});
