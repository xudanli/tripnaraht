/**
 * 冰岛 CPRE alias 全量 upsert（catalog SSOT → poi_aliases）
 *
 * Usage:
 *   npx tsx scripts/cpre-refresh-iceland-aliases.ts
 *   npm run cpre:refresh-iceland-aliases
 *
 * 在扩充 iceland-canonical-poi.catalog 或 fuzzy 规则后运行；幂等。
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { buildIcelandPoiAliasSeedRows } from '../src/canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';
import { ICELAND_CANONICAL_POI_CATALOG } from '../src/canonical-poi-resolution/fixtures/iceland-canonical-poi.catalog';

const prisma = new PrismaClient();

async function main() {
  const rows = buildIcelandPoiAliasSeedRows();
  let upserted = 0;

  for (const row of rows) {
    await prisma.poiAlias.upsert({
      where: {
        poiId_alias: { poiId: row.poiId, alias: row.alias },
      },
      create: {
        poiId: row.poiId,
        alias: row.alias,
        locale: row.locale,
        source: row.source,
        confidence: 1.0,
      },
      update: {
        locale: row.locale,
        source: row.source,
      },
    });
    upserted += 1;
  }

  const total = await prisma.poiAlias.count();
  const byPoi = await prisma.poiAlias.groupBy({
    by: ['poiId'],
    _count: { alias: true },
  });

  console.log(
    JSON.stringify(
      {
        catalogPois: ICELAND_CANONICAL_POI_CATALOG.length,
        seedRowsProcessed: upserted,
        poiAliasesTotal: total,
        distinctPois: byPoi.length,
        sample: byPoi
          .sort((a, b) => b._count.alias - a._count.alias)
          .slice(0, 5)
          .map((r) => ({ poiId: r.poiId, aliases: r._count.alias })),
      },
      null,
      2,
    ),
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
