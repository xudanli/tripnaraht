#!/usr/bin/env tsx
/**
 * Week 3.1 — Entity Resolution Qdrant 全量 seeding。
 *
 * 用法：
 *   npm run seed:er-qdrant
 *   npm run seed:er-qdrant -- --force        # 重建集合
 *   npm run seed:er-qdrant -- --dry-run      # 仅打印目录统计
 *
 * 环境变量：
 *   QDRANT_URL              — 必填，如 http://qdrant:6333
 *   PYTHON_AI_SERVICE_URL   — BGE-M3 embedding 服务
 *   EMBEDDING_DIMENSION     — 默认 1024
 *   ER_QDRANT_BATCH_SIZE    — upsert 批大小，默认 32
 */

import dotenv from 'dotenv';
import {
  buildErQdrantCatalog,
  stableErPointId,
  type ErQdrantCatalogEntry,
} from '../src/agent/data/entity-resolution-qdrant-catalog';
import {
  QdrantErClient,
  resolveQdrantBaseUrl,
} from '../src/agent/utils/qdrant-er-client.util';
import { ErQdrantEmbeddingClient } from './lib/er-qdrant-embedding.util';

dotenv.config();

const VECTOR_DIM = Number(process.env.EMBEDDING_DIMENSION ?? 1024);
const BATCH_SIZE = Number(process.env.ER_QDRANT_BATCH_SIZE ?? 32);

function parseArgs(): { force: boolean; dryRun: boolean } {
  const args = process.argv.slice(2);
  return {
    force: args.includes('--force'),
    dryRun: args.includes('--dry-run'),
  };
}

function isZeroVector(vec: number[]): boolean {
  return vec.every((v) => v === 0);
}

async function embedCatalog(
  catalog: ErQdrantCatalogEntry[],
  embedder: ErQdrantEmbeddingClient,
): Promise<Array<{ entry: ErQdrantCatalogEntry; vector: number[] }>> {
  const texts = catalog.map((e) => e.standard_name);
  const vectors = await embedder.generateEmbeddingsBatch(texts, 8, (done, total) => {
    process.stdout.write(`\r  Embedding: ${done}/${total}`);
  });
  process.stdout.write('\n');

  const result: Array<{ entry: ErQdrantCatalogEntry; vector: number[] }> = [];
  for (let i = 0; i < catalog.length; i++) {
    const vector = vectors[i];
    if (!vector?.length || isZeroVector(vector)) {
      console.warn(`  ⚠️  跳过零向量: ${catalog[i].standard_name}`);
      continue;
    }
    if (vector.length !== VECTOR_DIM) {
      console.warn(
        `  ⚠️  维度不匹配 ${catalog[i].standard_name}: got ${vector.length}, expected ${VECTOR_DIM}`,
      );
    }
    result.push({ entry: catalog[i], vector });
  }
  return result;
}

async function main(): Promise<void> {
  const { force, dryRun } = parseArgs();
  const configuredUrl = process.env.QDRANT_URL?.trim();
  const qdrantUrl = await resolveQdrantBaseUrl(configuredUrl);

  if (!qdrantUrl) {
    console.error(
      `❌ 无法连接 Qdrant（已尝试: ${[configuredUrl, 'http://127.0.0.1:6333', 'http://localhost:6333'].filter(Boolean).join(', ')}）`,
    );
    console.error('   请先启动 Qdrant: npm run qdrant:local');
    process.exit(1);
  }

  if (configuredUrl && configuredUrl !== qdrantUrl) {
    console.log(`ℹ️  QDRANT_URL=${configuredUrl} 不可达，已 fallback → ${qdrantUrl}`);
  }

  const catalog = buildErQdrantCatalog();
  const entityIds = new Set(catalog.map((e) => e.entity_id));

  console.log('📦 Entity Resolution Qdrant Seeding');
  console.log(`   Qdrant:     ${qdrantUrl}`);
  console.log(`   Collection: tripnara_er_entities`);
  console.log(`   Entries:    ${catalog.length} (${entityIds.size} unique entity_ids)`);
  console.log(`   Vector dim: ${VECTOR_DIM}`);

  if (dryRun) {
    console.log('\n🏷️  Sample entries (first 10):');
    for (const e of catalog.slice(0, 10)) {
      console.log(
        `   - ${e.standard_name} [${e.kind}] → ${e.entity_id}${e.parent_destination ? ` (parent: ${e.parent_destination})` : ''}`,
      );
    }
    console.log('\n✅ Dry run complete');
    return;
  }

  const qdrant = new QdrantErClient(qdrantUrl);

  const exists = await qdrant.collectionExists();
  if (exists && force) {
    console.log('🗑️  --force: 删除现有集合...');
    await qdrant.deleteCollection();
  } else if (exists && !force) {
    const info = await qdrant.getCollectionInfo();
    console.log(
      `ℹ️  集合已存在 (points=${info.points_count ?? '?'}), 将 upsert 覆盖同 id 点位。使用 --force 重建。`,
    );
  }

  if (!exists || force) {
    console.log('🔧 创建集合...');
    await qdrant.createCollection(VECTOR_DIM);
  }

  console.log('🧠 生成 BGE-M3 embeddings...');
  const embedder = new ErQdrantEmbeddingClient();
  const embedded = await embedCatalog(catalog, embedder);
  console.log(`   有效向量: ${embedded.length}/${catalog.length}`);

  console.log(`📤 Upsert 到 Qdrant (batch=${BATCH_SIZE})...`);
  let upserted = 0;
  for (let i = 0; i < embedded.length; i += BATCH_SIZE) {
    const batch = embedded.slice(i, i + BATCH_SIZE);
    const points = batch.map(({ entry, vector }) => ({
      id: stableErPointId(entry.entity_id, entry.standard_name),
      vector,
      payload: {
        standard_name: entry.standard_name,
        kind: entry.kind,
        entity_id: entry.entity_id,
        ...(entry.parent_destination
          ? { parent_destination: entry.parent_destination }
          : {}),
      },
    }));

    await qdrant.upsertPoints(points);
    upserted += points.length;
    process.stdout.write(`\r   Upserted: ${upserted}/${embedded.length}`);
  }
  process.stdout.write('\n');

  const info = await qdrant.getCollectionInfo();
  console.log(`\n✅ Seeding 完成 — collection points: ${info.points_count ?? upserted}`);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error('❌ Seeding 失败:', msg);
  process.exit(1);
});
