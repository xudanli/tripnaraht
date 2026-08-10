#!/usr/bin/env npx tsx
/**
 * 导入冰岛经典线额外按日变体（不覆盖 useExistingTemplate 的默认库模板）。
 *
 *   npx tsx scripts/import-iceland-classic-self-drive-templates.ts
 *   npx tsx scripts/import-iceland-classic-self-drive-templates.ts --dry-run
 *
 * 之后：
 *   npx tsx scripts/bind-iceland-classic-template-places.ts
 */
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

type DayStop = {
  day: number;
  from: string;
  to: string;
  driveKmHint?: number;
  overnight?: string;
  highlights?: string[];
  notesCN?: string;
};

type Variant = {
  id: string;
  days: number;
  labelCN: string;
  labelEN?: string;
  stops: DayStop[];
  useExistingTemplate?: boolean;
};

type RouteMeta = {
  id: string;
  directionName: string;
  nameCN: string;
  nameEN: string;
  taxonomySubScopeId?: string;
};

function templateUuid(routeId: string, variantId: string): string {
  return `is-classic-${routeId.replace(/\./g, '-')}-${variantId}`;
}

function stopToDayPlan(stop: DayStop) {
  const pois: Array<Record<string, unknown>> = [];
  const seen = new Set<string>();
  const pushPoi = (
    name: string,
    priority: 'MUST_SEE' | 'HIGH' | 'MEDIUM',
    category: string,
  ) => {
    const key = name.trim();
    if (!key || seen.has(key)) return;
    seen.add(key);
    pois.push({
      nameEN: key,
      nameCN: key,
      category,
      priority,
      required: priority === 'MUST_SEE',
      durationMinutes: priority === 'MUST_SEE' ? 90 : 60,
    });
  };

  for (const h of stop.highlights ?? []) pushPoi(h, 'HIGH', 'ATTRACTION');
  if (stop.to && stop.to !== stop.from) pushPoi(stop.to, 'MUST_SEE', 'CITY');
  else if (stop.from) pushPoi(stop.from, 'MUST_SEE', 'CITY');
  if (stop.overnight && !seen.has(stop.overnight)) {
    pushPoi(stop.overnight, 'MEDIUM', 'TOWN');
  }

  return {
    day: stop.day,
    theme: `${stop.from}→${stop.to}`,
    overnight: stop.overnight,
    driveKmHint: stop.driveKmHint,
    notes: stop.notesCN || undefined,
    pois,
  };
}

async function main() {
  const routesPath = join(
    process.cwd(),
    'data/country-packs/IS/classic-self-drive-routes.v1.json',
  );
  const skelPath = join(
    process.cwd(),
    'data/country-packs/IS/classic-self-drive-day-skeletons.v1.json',
  );
  const { routes } = JSON.parse(readFileSync(routesPath, 'utf-8')) as {
    routes: RouteMeta[];
  };
  const skeletons = JSON.parse(readFileSync(skelPath, 'utf-8')) as {
    routes: Record<string, { variants: Variant[] }>;
  };

  console.log(`Importing IS classic variants${dryRun ? ' (dry-run)' : ''}...\n`);

  for (const route of routes) {
    const skel = skeletons.routes[route.id];
    if (!skel) continue;

    const dir = await prisma.routeDirection.findFirst({
      where: { name: route.directionName, countryCode: 'IS' },
      select: { id: true, name: true },
    });
    if (!dir) {
      console.warn(`  ⚠️  skip ${route.id}: direction ${route.directionName} missing`);
      continue;
    }

    console.log(`→ ${route.id} (${route.directionName})`);
    for (const variant of skel.variants) {
      if (variant.useExistingTemplate || !variant.stops?.length) {
        console.log(`  skip existing/default variant ${variant.id}`);
        continue;
      }
      const uuid = templateUuid(route.id, variant.id);
      const dayPlans = variant.stops.map(stopToDayPlan);
      const existing = await prisma.routeTemplate.findUnique({
        where: { uuid },
        select: { id: true },
      });

      const data = {
        routeDirectionId: dir.id,
        durationDays: variant.days,
        name: variant.labelEN || variant.labelCN,
        nameCN: variant.labelCN,
        nameEN: variant.labelEN || variant.labelCN,
        dayPlans: dayPlans as any,
        defaultPacePreference: 'BALANCED',
        isActive: true,
        metadata: {
          classicRouteId: route.id,
          variantId: variant.id,
          taxonomySubScopeId: route.taxonomySubScopeId,
          source: 'classic-self-drive-day-skeletons.v1.json',
        } as any,
      };

      if (dryRun) {
        console.log(`  [DRY] ${existing ? 'UPDATE' : 'CREATE'} ${uuid} ${variant.days}d`);
        continue;
      }

      if (existing) {
        await prisma.routeTemplate.update({ where: { id: existing.id }, data });
        console.log(`  ✅ UPDATE ${uuid}`);
      } else {
        await prisma.routeTemplate.create({
          data: { uuid, ...data },
        });
        console.log(`  ✅ CREATE ${uuid}`);
      }
    }
  }

  console.log('\nDone.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
