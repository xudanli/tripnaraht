#!/usr/bin/env npx tsx
/**
 * 为中国经典自驾线缺口补 City + Place（近似坐标）。
 *
 *   npx tsx scripts/seed-china-classic-route-places.ts
 *   npx tsx scripts/seed-china-classic-route-places.ts --dry-run
 *
 * 完成后建议：
 *   npx tsx scripts/bind-china-classic-template-places.ts
 */
import { PrismaClient, Prisma } from '@prisma/client';
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
  /** 近似海拔（米），写入 Place.metadata，供高原门禁提示 */
  altitudeMeters?: number;
};

async function upsertCity(c: SeedCity): Promise<number> {
  const existing = await prisma.city.findFirst({
    where: {
      countryCode: 'CN',
      OR: [{ nameCN: c.nameCN }, { name: c.name }, { nameEN: c.nameEN }],
    },
    select: { id: true },
  });

  if (dryRun) {
    console.log(`  [DRY] city ${existing ? 'KEEP' : 'CREATE'} ${c.nameCN}`);
    return existing?.id ?? -1;
  }

  if (existing) {
    await prisma.$executeRaw`
      UPDATE "City"
      SET
        location = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
        "nameCN" = ${c.nameCN},
        "nameEN" = ${c.nameEN},
        name = ${c.name}
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
      'CN',
      ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography
    )
    RETURNING id
  `;
  console.log(`  ✅ city CREATE ${c.nameCN} (id=${row.id})`);
  return row.id;
}

async function resolveCityId(
  cityCN: string,
  fallback?: string,
  cache?: Map<string, number>,
): Promise<number | null> {
  const key = cityCN;
  if (cache?.has(key)) return cache.get(key)!;

  let city = await prisma.city.findFirst({
    where: {
      countryCode: 'CN',
      OR: [{ nameCN: cityCN }, { nameCN: { contains: cityCN } }, { name: cityCN }],
    },
    select: { id: true },
  });
  if (!city && fallback) {
    city = await prisma.city.findFirst({
      where: {
        countryCode: 'CN',
        OR: [
          { nameCN: fallback },
          { nameCN: { contains: fallback } },
          { name: fallback },
        ],
      },
      select: { id: true },
    });
  }
  if (city && cache) cache.set(key, city.id);
  return city?.id ?? null;
}

async function upsertPlace(
  place: SeedPlace,
  cityId: number | null,
): Promise<'created' | 'updated' | 'skipped'> {
  const existing = await prisma.place.findFirst({
    where: {
      nameCN: place.nameCN,
      City: { countryCode: 'CN' },
    },
    select: { id: true },
  });

  const metadata = {
    countryCode: 'CN',
    classicRouteSeed: true,
    aliases: place.aliases ?? [],
    coordinates: { lat: place.lat, lng: place.lng },
    ...(typeof place.altitudeMeters === 'number'
      ? { altitudeMeters: place.altitudeMeters }
      : {}),
    dataSource: 'classic-route-places.seed.v1',
  };

  if (dryRun) {
    console.log(
      `  [DRY] place ${existing ? 'UPDATE' : 'CREATE'} ${place.nameCN}` +
        (cityId ? ` cityId=${cityId}` : ' (no city)'),
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
        rating = ${place.rating ?? 4},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
        data_source = 'classic-route-seed',
        "updatedAt" = NOW()
      WHERE id = ${existing.id}
    `;
    return 'updated';
  }

  if (!cityId) {
    console.warn(`  ⚠️  skip place ${place.nameCN}: city not found`);
    return 'skipped';
  }

  const uuid = `cn-classic-place-${place.nameCN}-${randomUUID().slice(0, 8)}`;
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
  console.log(`  ✅ place CREATE ${place.nameCN}`);
  return 'created';
}

async function main() {
  const path = join(
    process.cwd(),
    'data/country-packs/CN/classic-route-places.seed.v1.json',
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
    if (id > 0) cityCache.set(c.nameCN, id);
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const place of seed.places) {
    let cityId =
      cityCache.get(place.cityCN) ??
      (await resolveCityId(place.cityCN, place.cityFallbackName, cityCache));
    // 叶城 → 已有莎车县等
    if (!cityId && place.cityFallbackName) {
      cityId = await resolveCityId(place.cityFallbackName, undefined, cityCache);
    }
    const r = await upsertPlace(place, cityId);
    if (r === 'created') created++;
    else if (r === 'updated') updated++;
    else skipped++;
  }

  console.log('\n================================');
  console.log(`Cities seeded: ${seed.cities.length}`);
  console.log(`Places: created=${created}, updated=${updated}, skipped=${skipped}`);
  console.log('================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
