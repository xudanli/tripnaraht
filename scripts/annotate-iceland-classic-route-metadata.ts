#!/usr/bin/env npx tsx
/**
 * 为现有 IS RouteDirection / RouteTemplate 写入 classicRouteId 与 classic_route tag。
 *
 *   npx tsx scripts/annotate-iceland-classic-route-metadata.ts
 *   npx tsx scripts/annotate-iceland-classic-route-metadata.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

type RouteRow = {
  id: string;
  directionName: string;
  aliases?: string[];
  taxonomySubScopeId?: string;
  tier?: string;
};

async function main() {
  const path = join(
    process.cwd(),
    'data/country-packs/IS/classic-self-drive-routes.v1.json',
  );
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  const { routes } = JSON.parse(readFileSync(path, 'utf-8')) as {
    routes: RouteRow[];
  };

  for (const route of routes) {
    const dir = await prisma.routeDirection.findFirst({
      where: { name: route.directionName, countryCode: 'IS' },
      include: { RouteTemplate: { where: { isActive: true } } },
    });
    if (!dir) {
      console.warn(`  ⚠️  missing direction ${route.directionName}`);
      continue;
    }

    const tags = Array.from(
      new Set([
        ...(dir.tags || []),
        'classic_route',
        'self_drive',
        route.tier || 'classic',
        ...(route.aliases || []).slice(0, 6),
        route.taxonomySubScopeId,
      ].filter(Boolean) as string[]),
    );

    const metadata = {
      ...((dir.metadata as object) || {}),
      classicRouteId: route.id,
      taxonomySubScopeId: route.taxonomySubScopeId,
    };

    console.log(
      `  ${route.directionName} → ${route.id} templates=${dir.RouteTemplate.length}`,
    );

    if (!dryRun) {
      await prisma.routeDirection.update({
        where: { id: dir.id },
        data: { tags, metadata: metadata as any },
      });
      for (const tpl of dir.RouteTemplate) {
        await prisma.routeTemplate.update({
          where: { id: tpl.id },
          data: {
            metadata: {
              ...((tpl.metadata as object) || {}),
              classicRouteId: route.id,
              taxonomySubScopeId: route.taxonomySubScopeId,
            } as any,
          },
        });
      }
    }
  }

  console.log(dryRun ? '\nDRY-RUN done' : '\nAnnotated.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
