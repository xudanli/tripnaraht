/**
 * Travel World Model Phase 2: PlaceEdge 预计算脚本
 *
 * 为同城 Place 对（距离 < 5km）生成 walkTimeMin
 * 基于 haversine 距离，步行速度 5 km/h
 *
 * 用法: npx ts-node scripts/seed-place-edges.ts [--dry-run] [--country IS]
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const MAX_RADIUS_KM = 5;
const WALK_SPEED_KMH = 5;
const BATCH_SIZE = 500;

function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function walkTimeMin(distanceKm: number): number {
  return Math.ceil((distanceKm / WALK_SPEED_KMH) * 60);
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const countryArg = process.argv.find((a) => a.startsWith('--country='));
  const countryCode = countryArg?.split('=')[1]?.toUpperCase();

  console.log(
    `PlaceEdge 预计算: maxRadius=${MAX_RADIUS_KM}km, dryRun=${dryRun}${countryCode ? `, country=${countryCode}` : ''}`,
  );

  const places = countryCode
    ? await prisma.$queryRaw<
        Array<{ id: number; cityId: number; lat: number; lng: number }>
      >(Prisma.sql`
        SELECT p.id, p."cityId",
          ST_Y(p.location::geometry)::float as lat,
          ST_X(p.location::geometry)::float as lng
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE p.location IS NOT NULL AND p."cityId" IS NOT NULL
          AND c."countryCode" = ${countryCode}
      `)
    : await prisma.$queryRaw<
        Array<{ id: number; cityId: number; lat: number; lng: number }>
      >(Prisma.sql`
        SELECT p.id, p."cityId",
          ST_Y(p.location::geometry)::float as lat,
          ST_X(p.location::geometry)::float as lng
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE p.location IS NOT NULL AND p."cityId" IS NOT NULL
      `);

  const byCity = new Map<number, typeof places>();
  for (const p of places) {
    const arr = byCity.get(p.cityId) ?? [];
    arr.push(p);
    byCity.set(p.cityId, arr);
  }

  const edges: Array<{
    fromPlaceId: number;
    toPlaceId: number;
    distanceM: number;
    walkTimeMin: number;
    source: string;
  }> = [];

  for (const [cityId, cityPlaces] of byCity) {
    const limited = cityPlaces.slice(0, 80);
    for (let i = 0; i < limited.length; i++) {
      for (let j = i + 1; j < limited.length; j++) {
        const a = limited[i];
        const b = limited[j];
        const km = haversineKm(a.lat, a.lng, b.lat, b.lng);
        if (km > MAX_RADIUS_KM || km < 0.01) continue;
        const distM = Math.round(km * 1000);
        const wt = walkTimeMin(km);
        edges.push({
          fromPlaceId: a.id,
          toPlaceId: b.id,
          distanceM: distM,
          walkTimeMin: wt,
          source: 'computed',
        });
        edges.push({
          fromPlaceId: b.id,
          toPlaceId: a.id,
          distanceM: distM,
          walkTimeMin: wt,
          source: 'computed',
        });
      }
    }
  }

  console.log(`生成 ${edges.length} 条边`);

  if (dryRun) {
    console.log('--dry-run: 跳过写入');
    return;
  }

  for (let i = 0; i < edges.length; i += BATCH_SIZE) {
    const batch = edges.slice(i, i + BATCH_SIZE);
    await prisma.placeEdge.createMany({
      data: batch,
      skipDuplicates: true,
    });
    console.log(`写入 ${Math.min(i + BATCH_SIZE, edges.length)} / ${edges.length}`);
  }

  console.log('完成');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
