/**
 * RAG: 回填 chunks.category + token_count（收尾路径）
 *
 * 推荐顺序（与 --apply 内执行顺序一致）:
 *   1) 路况错位修复：kf.category=road_status 且 chunk 误标 WEATHER → ROAD_STATUS（GATE 簇前提）
 *   2) 分类/ F-Road 细化回填
 *   3) token_count（gpt-4o / tiktoken）
 *
 * 默认 dry-run。写入: npm run rag:backfill-chunk-categories -- --apply
 *
 * --apply --skip-tokens                      只写 category（仍先做路况错位修复，除非加下面开关）
 * --apply --skip-road-weather-mislabel-fix   跳过第 1 步路况错位 SQL
 * --apply --tokens-only                      只写 token_count（不做 1–2）
 * --apply --force-recategory                 覆盖已有 category（慎用）
 *
 * Post-apply: SELECT category, COUNT(*) FROM chunks GROUP BY 1 ORDER BY 2 DESC;
 * Token 抽检：Öræfajökull、Skeiðarársandur、ð/þ 与 token_count 对齐；Prompt 裁剪留 buffer。
 * CGUS：见 retrievalCategoryHints + buildConstraintPenaltyCoefficientsFromRetrievalHints。
 */
import 'dotenv/config';

import { encoding_for_model } from '@dqbd/tiktoken';
import { Prisma, PrismaClient } from '@prisma/client';

import {
  deriveChunkCategory,
  type ChunkCategoryLabel,
} from '../src/knowledge-base/chunk-category-derive';

const prisma = new PrismaClient();

async function batchUpdateCategories(
  rows: Array<{ id: string; category: ChunkCategoryLabel }>,
  apply: boolean,
): Promise<void> {
  if (rows.length === 0 || !apply) return;

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const tuples = slice.map((r) => Prisma.sql`(${r.id}::uuid, ${r.category}::varchar)`);
    await prisma.$executeRaw`
      UPDATE chunks AS c
      SET category = v.cat, "updated_at" = NOW()
      FROM (VALUES ${Prisma.join(tuples)}) AS v(id, cat)
      WHERE c.id = v.id
    `;
  }
}

async function batchUpdateTokenCounts(
  rows: Array<{ id: string; tokenCount: number }>,
  apply: boolean,
): Promise<void> {
  if (rows.length === 0 || !apply) return;

  const chunkSize = 200;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const slice = rows.slice(i, i + chunkSize);
    const tuples = slice.map((r) => Prisma.sql`(${r.id}::uuid, ${r.tokenCount}::int)`);
    await prisma.$executeRaw`
      UPDATE chunks AS c
      SET token_count = v.tc, "updated_at" = NOW()
      FROM (VALUES ${Prisma.join(tuples)}) AS v(id, tc)
      WHERE c.id = v.id
    `;
  }
}

function parseArgs(argv: string[]) {
  return {
    apply: argv.includes('--apply'),
    skipTokens: argv.includes('--skip-tokens'),
    tokensOnly: argv.includes('--tokens-only'),
    forceRecategory: argv.includes('--force-recategory'),
    skipRoadWeatherMislabelFix: argv.includes('--skip-road-weather-mislabel-fix'),
  };
}

async function countRoadStatusWeatherMislabel(): Promise<number> {
  const c = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n
    FROM chunks c
    INNER JOIN knowledge_files kf ON kf.id = c.file_id
    WHERE kf.category = 'road_status'
      AND c.category = 'WEATHER'
  `;
  return Number(c[0]?.n ?? 0);
}

async function applyRoadStatusWeatherMislabel(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE chunks c
    SET category = 'ROAD_STATUS', "updated_at" = NOW()
    FROM knowledge_files kf
    WHERE c.file_id = kf.id
      AND kf.category = 'road_status'
      AND c.category = 'WEATHER'
  `;
  return typeof result === 'number' ? result : Number(result);
}

async function countFRoadRefinementCandidates(): Promise<number> {
  const c = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(*)::bigint AS n FROM chunks
    WHERE category IN ('GENERAL', 'PRACTICAL', 'GEOGRAPHY')
      AND (
        content ILIKE '%f-road%'
        OR content ILIKE '%f road%'
        OR content ILIKE '%fjallvegur%'
        OR content ILIKE '%fjallveg%'
      )
  `;
  return Number(c[0]?.n ?? 0);
}

async function applyFRoadRefinement(): Promise<number> {
  const result = await prisma.$executeRaw`
    UPDATE chunks
    SET category = 'RULES', "updated_at" = NOW()
    WHERE category IN ('GENERAL', 'PRACTICAL', 'GEOGRAPHY')
      AND (
        content ILIKE '%f-road%'
        OR content ILIKE '%f road%'
        OR content ILIKE '%fjallvegur%'
        OR content ILIKE '%fjallveg%'
      )
  `;
  return typeof result === 'number' ? result : Number(result);
}

async function main() {
  const { apply, skipTokens, tokensOnly, forceRecategory, skipRoadWeatherMislabelFix } = parseArgs(
    process.argv.slice(2),
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? 'apply' : 'dry-run',
        skipTokens,
        tokensOnly,
        forceRecategory,
        skipRoadWeatherMislabelFix,
      },
      null,
      2,
    ),
  );

  let encoder: ReturnType<typeof encoding_for_model> | null = null;
  if (!skipTokens) {
    try {
      encoder = encoding_for_model('gpt-4o');
    } catch (e) {
      console.warn('tiktoken init failed, using char heuristic for token_count:', e);
    }
  }

  if (!tokensOnly) {
    const roadMis = await countRoadStatusWeatherMislabel();
    console.log(
      `Step 1 — road_status files mislabeled as WEATHER: ${roadMis} row(s) ${apply && !skipRoadWeatherMislabelFix ? '(will fix)' : skipRoadWeatherMislabelFix ? '(skipped by flag)' : '(dry-run)'}`,
    );
    if (apply && !skipRoadWeatherMislabelFix && roadMis > 0) {
      const fixed = await applyRoadStatusWeatherMislabel();
      console.log(`Step 1 — applied road_status→ROAD_STATUS correction: ${fixed} row(s)`);
    }

    const dist: Record<string, number> = {};
    const updates: Array<{ id: string; category: ChunkCategoryLabel }> = [];

    let catCursor: string | undefined;

    for (;;) {
      const page = await prisma.chunk.findMany({
        ...(forceRecategory ? {} : { where: { category: null } }),
        take: 400,
        orderBy: { id: 'asc' },
        ...(catCursor ? { cursor: { id: catCursor }, skip: 1 } : {}),
        include: {
          file: { select: { filename: true, category: true } },
        },
      });

      if (page.length === 0) break;

      for (const c of page) {
        const next = deriveChunkCategory({
          filename: c.file.filename,
          fileCategory: c.file.category,
          chunkType: c.type,
          metadata: c.metadata,
        });
        dist[next] = (dist[next] ?? 0) + 1;

        if (!forceRecategory && c.category !== null) {
          continue;
        }
        if (forceRecategory && c.category === next) {
          continue;
        }
        updates.push({ id: c.id, category: next });
      }

      catCursor = page[page.length - 1].id;
      if (page.length < 400) break;
    }

    console.log('Category derivation histogram:', dist);
    console.log(`Category rows to write: ${updates.length}`);

    await batchUpdateCategories(updates, apply);

    const fRoadN = apply ? await applyFRoadRefinement() : await countFRoadRefinementCandidates();
    console.log(`F-Road refinement ${apply ? 'updated' : 'would update'} rows: ${fRoadN}`);
  }

  if (!skipTokens) {
    const tokenUpdates: Array<{ id: string; tokenCount: number }> = [];
    const lengths: number[] = [];
    let tokCursor: string | undefined;

    for (;;) {
      const page = await prisma.chunk.findMany({
        where: { tokenCount: null },
        take: 300,
        orderBy: { id: 'asc' },
        ...(tokCursor ? { cursor: { id: tokCursor }, skip: 1 } : {}),
        select: { id: true, content: true },
      });
      if (page.length === 0) break;

      for (const c of page) {
        let tc = Math.ceil(c.content.length / 3);
        if (encoder) {
          try {
            tc = encoder.encode_ordinary(c.content).length;
          } catch {
            // keep heuristic
          }
        }
        tokenUpdates.push({ id: c.id, tokenCount: tc });
        lengths.push(tc);
      }

      tokCursor = page[page.length - 1].id;
      if (page.length < 300) break;
    }

    const avg = lengths.length ? lengths.reduce((a, b) => a + b, 0) / lengths.length : 0;
    console.log(`Token_count rows to write: ${tokenUpdates.length}, avg≈${avg.toFixed(1)}`);

    await batchUpdateTokenCounts(tokenUpdates, apply);
  }

  encoder?.free();
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
