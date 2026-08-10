#!/usr/bin/env npx tsx
/**
 * 重绑 IS RouteTemplate dayPlans.pois 到有效 Place，并写入 bindStatus。
 *
 *   npx tsx scripts/bind-iceland-classic-template-places.ts
 *   npx tsx scripts/bind-iceland-classic-template-places.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import {
  findCityHubPlace,
  findPlaceByTemplatePoiNames,
} from '../src/route-directions/utils/template-poi-place-match.util';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

/** stale template id → preferred name / alias */
const STALE_ID_ALIASES: Record<number, string[]> = {
  381467: ['Kerið Crater', 'Kerið', 'Kerid'],
  381468: ['Kirkjufell'],
  381469: ['Arnarstapi'],
  381470: ['Búðir Black Church', 'Búðir', 'Budir'],
  381471: ['Hallgrímskirkja', 'Hallgrimskirkja'],
  381464: ['Seyðisfjörður', 'Seydisfjordur'],
  381465: ['Hverir Geothermal Area', 'Hverir', 'Hverir - Boiling Mud'],
  381466: ['Borgarfjörður eystri', 'Borgarfjörður'],
  381463: ['Rauðasandur', 'Rauðasandur Beach Viewpoint'],
  381461: ['Laugavegur Trail', 'Laugavegur'],
  381462: ['Kerlingarfjöll', 'Kerlingarfjoll'],
  381472: ['Hrafntinnusker'],
  381473: ['Álftavatn', 'Alftavatn'],
  381474: ['Emstrur'],
  381475: ['Fimmvörðuháls', 'Fimmvorduhals'],
};

const NAME_ALIASES: Record<string, string[]> = {
  Geysir: ['Geysir', 'Strokkur'],
  'Kerið Crater': ['Kerið Crater', 'Kerið'],
  Kirkjufell: ['Kirkjufell'],
  Arnarstapi: ['Arnarstapi'],
  'Búðir Black Church': ['Búðir Black Church', 'Búðir'],
  Hallgrímskirkja: ['Hallgrímskirkja'],
  Seyðisfjörður: ['Seyðisfjörður'],
  'Hverir Geothermal Area': ['Hverir Geothermal Area', 'Hverir - Boiling Mud', 'Hverir'],
  Borgarfjörður: ['Borgarfjörður eystri', 'Borgarfjörður'],
  Rauðasandur: ['Rauðasandur', 'Rauðasandur Beach Viewpoint'],
  'Laugavegur Trail': ['Laugavegur Trail', 'Laugavegur'],
  Kerlingarfjöll: ['Kerlingarfjöll'],
  Hrafntinnusker: ['Hrafntinnusker'],
  Álftavatn: ['Álftavatn'],
  Emstrur: ['Emstrur'],
  Fimmvörðuháls: ['Fimmvörðuháls'],
  Akureyri: ['Akureyri'],
  Reykjavík: ['Reykjavík', 'Reykjavik'],
};

async function placeExists(id: number): Promise<boolean> {
  const row = await prisma.place.findUnique({
    where: { id },
    select: { id: true },
  });
  return Boolean(row);
}

async function resolvePoi(poi: any): Promise<{
  place: Awaited<ReturnType<typeof findPlaceByTemplatePoiNames>>;
  strategy: string;
}> {
  const nameEN = String(poi.nameEN || '').trim();
  const nameCN = String(poi.nameCN || '').trim();
  const id = poi.id ? Number(poi.id) : NaN;

  if (Number.isFinite(id) && (await placeExists(id))) {
    const row = await prisma.place.findUnique({
      where: { id },
      select: {
        id: true,
        uuid: true,
        nameCN: true,
        nameEN: true,
        category: true,
      },
    });
    if (row) return { place: row, strategy: 'existing_id' };
  }

  const aliases = [
    ...(Number.isFinite(id) ? STALE_ID_ALIASES[id] || [] : []),
    ...(NAME_ALIASES[nameEN] || []),
    ...(NAME_ALIASES[nameCN] || []),
    nameEN,
    nameCN,
  ].filter(Boolean);

  const hit = await findPlaceByTemplatePoiNames(
    prisma,
    { nameEN: nameEN || undefined, nameCN: nameCN || undefined },
    'IS',
    {
      excludeCategories: ['HOTEL', 'RESTAURANT'],
      aliasNames: aliases,
      cityFallback: true,
    },
  );
  if (hit) return { place: hit, strategy: 'name_or_alias' };

  const hub = await findCityHubPlace(
    prisma,
    aliases,
    'IS',
    ['HOTEL', 'RESTAURANT'],
  );
  if (hub) return { place: hub, strategy: 'city_hub' };

  return { place: null, strategy: 'unresolved' };
}

async function main() {
  const templates = await prisma.routeTemplate.findMany({
    where: {
      isActive: true,
      routeDirection: { countryCode: 'IS', isActive: true },
    },
    include: { routeDirection: { select: { name: true, nameCN: true } } },
  });

  console.log(
    `Binding ${templates.length} IS templates${dryRun ? ' (dry-run)' : ''}...\n`,
  );

  let total = 0;
  let bound = 0;
  let unresolved = 0;

  for (const tpl of templates) {
    const dayPlans = Array.isArray(tpl.dayPlans) ? (tpl.dayPlans as any[]) : [];
    const nextDays = [];
    let tplBound = 0;
    let tplTotal = 0;

    for (const day of dayPlans) {
      const pois = Array.isArray(day.pois) ? day.pois : [];
      const nextPois = [];
      for (const poi of pois) {
        tplTotal++;
        total++;
        const { place, strategy } = await resolvePoi(poi);
        if (!place) {
          unresolved++;
          nextPois.push({ ...poi, bindStatus: 'unresolved', bindStrategy: strategy });
          continue;
        }
        bound++;
        tplBound++;
        nextPois.push({
          ...poi,
          id: place.id,
          uuid: place.uuid,
          nameCN: poi.nameCN || place.nameCN,
          nameEN: poi.nameEN || place.nameEN || undefined,
          category: poi.category || place.category,
          bindStatus: 'bound',
          bindStrategy: strategy,
          resolvedPlaceNameEN: place.nameEN,
          resolvedPlaceNameCN: place.nameCN,
        });
      }
      nextDays.push({ ...day, pois: nextPois });
    }

    const rate = tplTotal ? Math.round((tplBound / tplTotal) * 100) : 100;
    console.log(
      `  ${tpl.routeDirection.name} · ${tpl.nameCN || tpl.uuid}: ${tplBound}/${tplTotal} bound (${rate}%)`,
    );

    if (!dryRun) {
      await prisma.routeTemplate.update({
        where: { id: tpl.id },
        data: {
          dayPlans: nextDays as any,
          metadata: {
            ...((tpl.metadata as object) || {}),
            placeBind: {
              bound: tplBound,
              total: tplTotal,
              rate,
              updatedAt: new Date().toISOString(),
            },
          } as any,
        },
      });
    }
  }

  console.log('\n================================');
  console.log(
    `POIs: bound=${bound}, unresolved=${unresolved}, total=${total}`,
  );
  console.log(
    `Coverage (excl. skipped): ${total ? Math.round((bound / total) * 100) : 0}%`,
  );
  console.log('================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
