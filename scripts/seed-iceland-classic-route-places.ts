#!/usr/bin/env npx tsx
/**
 * 为冰岛经典路线补 City + Place（枢纽 / 模板缺口）。
 *
 *   npx tsx scripts/seed-iceland-classic-route-places.ts
 *   npx tsx scripts/seed-iceland-classic-route-places.ts --dry-run
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

type SeedCity = {
  name: string;
  nameCN: string;
  nameEN: string;
  lat: number;
  lng: number;
};

type SeedPlace = {
  nameCN: string;
  nameEN: string;
  category: 'ATTRACTION' | 'TRANSIT_HUB' | 'SERVICE' | 'SUPPLY';
  cityCN: string;
  lat: number;
  lng: number;
  aliases?: string[];
  rating?: number;
  cityFallbackName?: string;
};

async function upsertCity(c: SeedCity): Promise<number> {
  const existing = await prisma.city.findFirst({
    where: {
      countryCode: 'IS',
      OR: [{ nameCN: c.nameCN }, { name: c.name }, { nameEN: c.nameEN }, { nameEN: c.name }],
    },
    select: { id: true },
  });

  if (dryRun) {
    console.log(`  [DRY] city ${existing ? 'KEEP' : 'CREATE'} ${c.nameEN}`);
    return existing?.id ?? -1;
  }

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "City"
      SET
        location = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
        "nameCN" = COALESCE(NULLIF("nameCN", ''), ${c.nameCN}),
        "nameEN" = COALESCE(NULLIF("nameEN", ''), ${c.nameEN}),
        name = COALESCE(NULLIF(name, ''), ${c.name})
      WHERE id = ${existing.id}
    `;
    return existing.id;
  }

  const [row] = await prisma.$queryRaw<Array<{ id: number }>>`
    INSERT INTO "City" (name, "nameCN", "nameEN", "countryCode", location)
    VALUES (
      ${c.name},
      ${c.nameCN},
      ${c.nameEN},
      'IS',
      ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography
    )
    RETURNING id
  `;
  console.log(`  ✅ city CREATE ${c.nameEN} (id=${row.id})`);
  return row.id;
}

async function resolveCityId(
  cityCN: string,
  fallback?: string,
  cache?: Map<string, number>,
): Promise<number | null> {
  if (cache?.has(cityCN)) return cache.get(cityCN)!;
  let city = await prisma.city.findFirst({
    where: {
      countryCode: 'IS',
      OR: [
        { nameCN: cityCN },
        { nameEN: cityCN },
        { name: cityCN },
        { nameCN: { contains: cityCN } },
        { nameEN: { contains: cityCN } },
      ],
    },
    select: { id: true },
  });
  if (!city && fallback) {
    city = await prisma.city.findFirst({
      where: {
        countryCode: 'IS',
        OR: [
          { nameCN: fallback },
          { nameEN: fallback },
          { name: fallback },
          { nameEN: { contains: fallback } },
        ],
      },
      select: { id: true },
    });
  }
  if (city && cache) cache.set(cityCN, city.id);
  return city?.id ?? null;
}

async function upsertPlace(
  place: SeedPlace,
  cityId: number | null,
): Promise<'created' | 'updated' | 'skipped'> {
  const existing = await prisma.place.findFirst({
    where: {
      City: { countryCode: 'IS' },
      OR: [{ nameEN: place.nameEN }, { nameCN: place.nameCN }],
    },
    select: { id: true },
  });

  const metadata = {
    countryCode: 'IS',
    classicRouteSeed: true,
    aliases: place.aliases ?? [],
    coordinates: { lat: place.lat, lng: place.lng },
    dataSource: 'classic-route-places.seed.v1',
  };

  if (dryRun) {
    console.log(
      `  [DRY] place ${existing ? 'UPDATE' : 'CREATE'} ${place.nameEN}`,
    );
    return existing ? 'updated' : 'created';
  }

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "Place"
      SET
        location = ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326)::geography,
        "cityId" = ${cityId},
        category = ${place.category}::"PlaceCategory",
        "nameEN" = ${place.nameEN},
        "nameCN" = ${place.nameCN},
        rating = ${place.rating ?? 4},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
        data_source = 'classic-route-seed',
        "updatedAt" = NOW()
      WHERE id = ${existing.id}
    `;
    return 'updated';
  }

  if (!cityId) {
    console.warn(`  ⚠️  skip place ${place.nameEN}: city not found`);
    return 'skipped';
  }

  const uuid = `is-classic-place-${place.nameEN.replace(/\s+/g, '-')}-${randomUUID().slice(0, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO "Place" (
      uuid, "nameEN", "nameCN", category, location, "cityId",
      rating, metadata, data_source, "createdAt", "updatedAt"
    ) VALUES (
      ${uuid},
      ${place.nameEN},
      ${place.nameCN},
      ${place.category}::"PlaceCategory",
      ST_SetSRID(ST_MakePoint(${place.lng}, ${place.lat}), 4326)::geography,
      ${cityId},
      ${place.rating ?? 4},
      ${JSON.stringify(metadata)}::jsonb,
      'classic-route-seed',
      NOW(),
      NOW()
    )
  `;
  console.log(`  ✅ place CREATE ${place.nameEN}`);
  return 'created';
}

async function main() {
  const path = join(
    process.cwd(),
    'data/country-packs/IS/classic-route-places.seed.v1.json',
  );
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  const seed = JSON.parse(readFileSync(path, 'utf-8')) as {
    cities: SeedCity[];
    places: SeedPlace[];
  };

  console.log(
    `Seeding ${seed.cities.length} cities + ${seed.places.length} places` +
      `${dryRun ? ' (dry-run)' : ''}...\n`,
  );

  const cityCache = new Map<string, number>();
  for (const c of seed.cities) {
    const id = await upsertCity(c);
    if (id > 0) {
      cityCache.set(c.nameCN, id);
      cityCache.set(c.nameEN, id);
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const place of seed.places) {
    const cityId =
      cityCache.get(place.cityCN) ??
      (await resolveCityId(place.cityCN, place.cityFallbackName, cityCache));
    const r = await upsertPlace(place, cityId);
    if (r === 'created') created++;
    else if (r === 'updated') updated++;
    else skipped++;
  }

  console.log(`\nPlaces: created=${created}, updated=${updated}, skipped=${skipped}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
