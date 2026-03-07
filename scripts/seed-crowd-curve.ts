/**
 * Travel World Model Phase 6: CrowdCurve 启发式填充脚本
 *
 * 按类别+时段估算 crowdLevel (0-1)
 * - RESTAURANT: 午餐12、晚餐18-19 高峰
 * - ATTRACTION/SHOPPING: 10-16 高峰
 * - 其他: 平峰
 *
 * 用法: npx ts-node scripts/seed-crowd-curve.ts [--dry-run] [--limit=500]
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const BATCH_SIZE = 1000;
const DEFAULT_LIMIT = 500;

/** 按类别+小时返回 crowdLevel 0-1 */
function heuristicCrowd(category: string, hour: number): number {
  const h = Math.max(0, Math.min(23, Math.floor(hour)));
  if (category === 'RESTAURANT') {
    if (h >= 11 && h <= 13) return 0.75;
    if (h >= 17 && h <= 20) return 0.85;
    return 0.3 + (h - 8) * 0.02;
  }
  if (category === 'ATTRACTION' || category === 'SHOPPING') {
    if (h >= 10 && h <= 16) return 0.7;
    if (h >= 9 && h <= 17) return 0.5;
    return 0.25;
  }
  return 0.4;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const limitArg = process.argv.find((a) => a.startsWith('--limit='));
  const limit = limitArg ? parseInt(limitArg.split('=')[1] || '500', 10) : DEFAULT_LIMIT;

  console.log(`CrowdCurve 填充: limit=${limit}, dryRun=${dryRun}`);

  const places = await prisma.$queryRaw<
    Array<{ id: number; category: string }>
  >(Prisma.sql`
    SELECT id, category
    FROM "Place"
    WHERE category IN ('ATTRACTION', 'RESTAURANT', 'SHOPPING', 'TRANSIT_HUB')
    ORDER BY COALESCE(rating, 0) DESC
    LIMIT ${limit}
  `);

  const rows: Array<{ placeId: number; hour: number; crowdLevel: number; source: string }> = [];
  for (const p of places) {
    for (let h = 0; h < 24; h++) {
      rows.push({
        placeId: p.id,
        hour: h,
        crowdLevel: Math.round(heuristicCrowd(p.category, h) * 100) / 100,
        source: 'estimated',
      });
    }
  }

  console.log(`生成 ${rows.length} 条 CrowdCurve (${places.length} 个 Place × 24h)`);

  if (dryRun) {
    console.log('--dry-run: 跳过写入');
    return;
  }

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);
    await prisma.crowdCurve.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`写入 ${Math.min(i + BATCH_SIZE, rows.length)} / ${rows.length}`);
  }

  console.log('完成');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
