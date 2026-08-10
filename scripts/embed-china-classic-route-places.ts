#!/usr/bin/env npx tsx
/**
 * 为 classic-route-seed Place 生成 BGE-M3 (1024) embedding。
 *
 *   npx tsx scripts/embed-china-classic-route-places.ts
 *   npx tsx scripts/embed-china-classic-route-places.ts --dry-run
 *   npx tsx scripts/embed-china-classic-route-places.ts --force
 *   npx tsx scripts/embed-china-classic-route-places.ts --batch=8
 *
 * 依赖：DATABASE_URL + PYTHON_AI_SERVICE_URL（BGE-M3）
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const batchArg = process.argv.find((a) => a.startsWith('--batch='));
const BATCH = batchArg ? Math.max(1, parseInt(batchArg.split('=')[1], 10)) : 8;

const PYTHON_AI_SERVICE_URL =
  process.env.PYTHON_AI_SERVICE_URL || 'http://10.107.180.94:8001';

const http = axios.create({
  baseURL: PYTHON_AI_SERVICE_URL,
  timeout: 60_000,
  proxy: false,
  httpsAgent: new https.Agent({ keepAlive: true, family: 4 }),
});

function buildSearchText(place: {
  nameCN: string;
  nameEN?: string | null;
  address?: string | null;
  description?: string | null;
}): string {
  return [place.nameCN, place.nameEN, place.address, place.description]
    .filter(Boolean)
    .join(' ')
    .trim();
}

async function embedBatch(texts: string[]): Promise<number[][]> {
  const response = await http.post('/api/v1/embeddings', {
    texts,
    model: 'bge-m3',
    return_sparse: false,
  });
  const embeddings = response.data?.embeddings;
  if (!Array.isArray(embeddings) || embeddings.length !== texts.length) {
    throw new Error(`embedding 数量不匹配: expected ${texts.length}`);
  }
  return embeddings.map((item: unknown) =>
    Array.isArray(item) ? item : ((item as { dense: number[] }).dense ?? item),
  );
}

async function main() {
  console.log(`PYTHON_AI_SERVICE_URL=${PYTHON_AI_SERVICE_URL}`);
  console.log(`mode=${dryRun ? 'DRY-RUN' : 'WRITE'} force=${force} batch=${BATCH}`);

  // health ping
  try {
    const ping = await http.get('/health').catch(() => http.get('/api/v1/health'));
    console.log(`health: ${ping.status}`);
  } catch (e: any) {
    console.warn(`health check skipped/failed: ${e?.message ?? e}`);
  }

  const places = await prisma.$queryRaw<
    Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      description: string | null;
      has_embedding: boolean;
    }>
  >`
    SELECT
      p.id,
      p."nameCN",
      p."nameEN",
      p.address,
      p.description,
      (p.embedding IS NOT NULL) AS has_embedding
    FROM "Place" p
    WHERE p.data_source = 'classic-route-seed'
      AND (
        ${force}
        OR p.embedding IS NULL
        OR vector_dims(p.embedding) <> 1024
      )
    ORDER BY p.id
  `;

  console.log(`targets: ${places.length}`);
  if (places.length === 0) {
    return;
  }

  let ok = 0;
  let fail = 0;

  for (let i = 0; i < places.length; i += BATCH) {
    const chunk = places.slice(i, i + BATCH);
    const texts = chunk.map(buildSearchText);
    const emptyIdx = texts
      .map((t, idx) => (t ? -1 : idx))
      .filter((idx) => idx >= 0);

    try {
      const vectors = await embedBatch(
        texts.map((t, idx) => t || chunk[idx].nameCN || `place-${chunk[idx].id}`),
      );

      for (let j = 0; j < chunk.length; j++) {
        const place = chunk[j];
        const embedding = vectors[j] as number[];
        if (!Array.isArray(embedding) || embedding.length !== 1024) {
          console.error(
            `  ❌ id=${place.id} ${place.nameCN}: bad dim ${Array.isArray(embedding) ? embedding.length : typeof embedding}`,
          );
          fail++;
          continue;
        }
        if (embedding.every((v) => v === 0)) {
          console.error(`  ❌ id=${place.id} ${place.nameCN}: zero vector`);
          fail++;
          continue;
        }
        if (dryRun) {
          console.log(
            `  [DRY] id=${place.id} ${place.nameCN} (had=${place.has_embedding}${emptyIdx.includes(j) ? ', empty-text' : ''})`,
          );
          ok++;
          continue;
        }

        const embeddingStr = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE "Place"
          SET embedding = ${embeddingStr}::vector(1024),
              "updatedAt" = NOW()
          WHERE id = ${place.id}
        `;
        console.log(`  ✅ id=${place.id} ${place.nameCN}`);
        ok++;
      }
    } catch (e: any) {
      console.error(`  ❌ batch@${i}: ${e?.message ?? e}`);
      fail += chunk.length;
    }

    await new Promise((r) => setTimeout(r, 80));
  }

  const stats = await prisma.$queryRaw<
    Array<{ total: bigint; with_emb: bigint }>
  >`
    SELECT
      COUNT(*)::bigint AS total,
      COUNT(*) FILTER (WHERE embedding IS NOT NULL AND vector_dims(embedding) = 1024)::bigint AS with_emb
    FROM "Place"
    WHERE data_source = 'classic-route-seed'
  `;

  console.log(`\ndone: ok=${ok} fail=${fail}`);
  console.log(
    `classic-route-seed coverage: ${stats[0].with_emb}/${stats[0].total}`,
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
