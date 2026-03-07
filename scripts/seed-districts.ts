#!/usr/bin/env npx tsx
/**
 * Travel World Model Phase 3: District 数据填充脚本
 *
 * 基于 Place 空间聚类创建 District，并更新 Place.districtId
 * - 按城市分组 Place
 * - 网格聚类：将经纬度范围划分为 gridSize×gridSize 网格
 * - 每个非空网格单元创建一个 District（center=质心，radiusM=最远点距离+缓冲）
 *
 * 用法: npx tsx scripts/seed-districts.ts [--dry-run] [--country=IS] [--grid-size=4]
 *
 * @see docs/TRAVEL_WORLD_MODEL_EXECUTION_PLAN.md
 */

import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const DEFAULT_GRID_SIZE = 4;
const RADIUS_BUFFER_M = 500; // 半径缓冲，确保边缘 Place 被包含

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const x =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

interface PlacePoint {
  id: number;
  cityId: number;
  lat: number;
  lng: number;
}

interface Cluster {
  cityId: number;
  cityName: string;
  places: PlacePoint[];
  centerLat: number;
  centerLng: number;
  radiusM: number;
  index: number;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const countryArg = process.argv.find((a) => a.startsWith('--country='));
  const countryCode = countryArg?.split('=')[1]?.toUpperCase();
  const gridArg = process.argv.find((a) => a.startsWith('--grid-size='));
  const gridSize = gridArg ? parseInt(gridArg.split('=')[1] || '4', 10) : DEFAULT_GRID_SIZE;

  console.log(
    `District 填充: gridSize=${gridSize}, dryRun=${dryRun}${countryCode ? `, country=${countryCode}` : ''}`,
  );

  const places = countryCode
    ? await prisma.$queryRaw<PlacePoint[]>(Prisma.sql`
        SELECT p.id, p."cityId",
          ST_Y(p.location::geometry)::float as lat,
          ST_X(p.location::geometry)::float as lng
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE p.location IS NOT NULL AND p."cityId" IS NOT NULL
          AND c."countryCode" = ${countryCode}
      `)
    : await prisma.$queryRaw<PlacePoint[]>(Prisma.sql`
        SELECT p.id, p."cityId",
          ST_Y(p.location::geometry)::float as lat,
          ST_X(p.location::geometry)::float as lng
        FROM "Place" p
        INNER JOIN "City" c ON p."cityId" = c.id
        WHERE p.location IS NOT NULL AND p."cityId" IS NOT NULL
      `);

  const byCity = new Map<number, PlacePoint[]>();
  for (const p of places) {
    const arr = byCity.get(p.cityId) ?? [];
    arr.push(p);
    byCity.set(p.cityId, arr);
  }

  const cities = await prisma.city.findMany({
    where: { id: { in: Array.from(byCity.keys()) } },
    select: { id: true, name: true, nameCN: true },
  });
  const cityMap = new Map(cities.map((c) => [c.id, c]));

  const clusters: Cluster[] = [];

  for (const [cityId, cityPlaces] of byCity) {
    if (cityPlaces.length < 2) continue;

    const city = cityMap.get(cityId);
    const cityName = city?.nameCN || city?.name || `City${cityId}`;

    const minLat = Math.min(...cityPlaces.map((p) => p.lat));
    const maxLat = Math.max(...cityPlaces.map((p) => p.lat));
    const minLng = Math.min(...cityPlaces.map((p) => p.lng));
    const maxLng = Math.max(...cityPlaces.map((p) => p.lng));

    const latStep = (maxLat - minLat) / gridSize || 0.001;
    const lngStep = (maxLng - minLng) / gridSize || 0.001;

    const grid = new Map<string, PlacePoint[]>();
    for (const p of cityPlaces) {
      const gi = Math.min(Math.floor((p.lat - minLat) / latStep) || 0, gridSize - 1);
      const gj = Math.min(Math.floor((p.lng - minLng) / lngStep) || 0, gridSize - 1);
      const key = `${gi},${gj}`;
      const arr = grid.get(key) ?? [];
      arr.push(p);
      grid.set(key, arr);
    }

    let idx = 0;
    for (const [, cellPlaces] of grid) {
      if (cellPlaces.length === 0) continue;

      const centerLat = cellPlaces.reduce((s, p) => s + p.lat, 0) / cellPlaces.length;
      const centerLng = cellPlaces.reduce((s, p) => s + p.lng, 0) / cellPlaces.length;
      let maxDist = 0;
      for (const p of cellPlaces) {
        const d = haversineM(p.lat, p.lng, centerLat, centerLng);
        if (d > maxDist) maxDist = d;
      }
      const radiusM = Math.ceil(maxDist) + RADIUS_BUFFER_M;

      clusters.push({
        cityId,
        cityName,
        places: cellPlaces,
        centerLat,
        centerLng,
        radiusM,
        index: idx++,
      });
    }
  }

  console.log(`生成 ${clusters.length} 个 District`);

  if (dryRun) {
    for (const c of clusters.slice(0, 5)) {
      console.log(
        `  ${c.cityName} D${c.index}: ${c.places.length} places, center=(${c.centerLat.toFixed(4)},${c.centerLng.toFixed(4)}), radius=${c.radiusM}m`,
      );
    }
    if (clusters.length > 5) console.log(`  ... 等共 ${clusters.length} 个`);
    console.log('--dry-run: 跳过写入');
    return;
  }

  const districtIdByPlaceId = new Map<number, number>();
  const now = new Date();

  for (const c of clusters) {
    const name = `${c.cityName}-区${c.index + 1}`;
    const [row] = await prisma.$queryRaw<Array<{ id: number }>>(Prisma.sql`
      INSERT INTO "District" ("cityId", "name", "nameCN", "center", "radiusM", "dominantExperience", "vibe", "createdAt", "updatedAt")
      VALUES (
        ${c.cityId},
        ${name},
        ${name},
        ST_SetSRID(ST_MakePoint(${c.centerLng}, ${c.centerLat}), 4326)::geography,
        ${c.radiusM},
        'mixed',
        '["walkable"]'::jsonb,
        ${now},
        ${now}
      )
      RETURNING id
    `);
    if (row) {
      for (const p of c.places) {
        districtIdByPlaceId.set(p.id, row.id);
      }
    }
  }

  const entries = Array.from(districtIdByPlaceId.entries());
  const BATCH = 200;
  for (let i = 0; i < entries.length; i += BATCH) {
    const batch = entries.slice(i, i + BATCH);
    await prisma.$transaction(
      batch.map(([placeId, districtId]) =>
        prisma.place.update({ where: { id: placeId }, data: { districtId } }),
      ),
    );
    console.log(`更新 Place.districtId: ${Math.min(i + BATCH, entries.length)} / ${entries.length}`);
  }

  console.log(`完成: ${clusters.length} 个 District, ${entries.length} 个 Place 已关联`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
