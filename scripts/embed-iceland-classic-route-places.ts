#!/usr/bin/env npx tsx
/**
 * 为冰岛经典线相关 Place 补 BGE-M3 embedding：
 * - data_source = classic-route-seed
 * - 以及 IS 模板 dayPlans 中已绑定的 place id
 *
 *   npx tsx scripts/embed-iceland-classic-route-places.ts
 *   npx tsx scripts/embed-iceland-classic-route-places.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import axios from 'axios';
import https from 'https';
import { config } from 'dotenv';

config();

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');
const force = process.argv.includes('--force');
const BATCH = 8;
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

async function collectTemplatePlaceIds(): Promise<number[]> {
  const templates = await prisma.routeTemplate.findMany({
    where: { isActive: true, routeDirection: { countryCode: 'IS' } },
    select: { dayPlans: true },
  });
  const ids = new Set<number>();
  for (const t of templates) {
    for (const day of (t.dayPlans as any[]) || []) {
      for (const poi of day.pois || []) {
        if (poi.id) ids.add(Number(poi.id));
      }
    }
  }
  return [...ids];
}

async function main() {
  console.log(`PYTHON_AI_SERVICE_URL=${PYTHON_AI_SERVICE_URL}`);
  const templateIds = await collectTemplatePlaceIds();

  const places = await prisma.$queryRaw<
    Array<{
      id: number;
      nameCN: string;
      nameEN: string | null;
      address: string | null;
      description: string | null;
    }>
  >`
    SELECT p.id, p."nameCN", p."nameEN", p.address, p.description
    FROM "Place" p
    LEFT JOIN "City" c ON c.id = p."cityId"
    WHERE (
      p.data_source = 'classic-route-seed'
      OR p.id = ANY(${templateIds}::int[])
    )
    AND (c."countryCode" = 'IS' OR p.metadata->>'countryCode' = 'IS')
    AND (
      ${force}
      OR p.embedding IS NULL
      OR vector_dims(p.embedding) <> 1024
    )
    ORDER BY p.id
  `;

  console.log(`targets: ${places.length} (templateIds=${templateIds.length})`);
  let ok = 0;
  let fail = 0;

  for (let i = 0; i < places.length; i += BATCH) {
    const chunk = places.slice(i, i + BATCH);
    try {
      const texts = chunk.map(
        (p) => buildSearchText(p) || p.nameEN || p.nameCN || `place-${p.id}`,
      );
      const vectors = await embedBatch(texts);
      for (let j = 0; j < chunk.length; j++) {
        const place = chunk[j];
        const embedding = vectors[j] as number[];
        if (!Array.isArray(embedding) || embedding.length !== 1024) {
          fail++;
          continue;
        }
        if (dryRun) {
          console.log(`  [DRY] ${place.id} ${place.nameEN || place.nameCN}`);
          ok++;
          continue;
        }
        const embeddingStr = `[${embedding.join(',')}]`;
        await prisma.$executeRaw`
          UPDATE "Place"
          SET embedding = ${embeddingStr}::vector(1024), "updatedAt" = NOW()
          WHERE id = ${place.id}
        `;
        console.log(`  ✅ ${place.id} ${place.nameEN || place.nameCN}`);
        ok++;
      }
    } catch (e: any) {
      console.error(`  ❌ batch@${i}: ${e?.message ?? e}`);
      fail += chunk.length;
    }
    await new Promise((r) => setTimeout(r, 80));
  }

  console.log(`\ndone: ok=${ok} fail=${fail}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
