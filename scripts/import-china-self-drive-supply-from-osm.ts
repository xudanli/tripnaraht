#!/usr/bin/env npx tsx
/**
 * CN 自驾补给 POI 主导入：沿经典线锚点用 Overpass（OSM）拉取。
 * 不依赖 AMAP_API_KEY。高德脚本仅为可选 enrich。
 *
 *   npx tsx scripts/import-china-self-drive-supply-from-osm.ts --route=g318 --dry-run
 *   npx tsx scripts/import-china-self-drive-supply-from-osm.ts --route=all --limit-per-anchor=20
 *   npx tsx scripts/import-china-self-drive-supply-from-osm.ts --route=g318 --types=fuel,charging,camping
 *
 * 幂等键：metadata.osmType + metadata.osmId + countryCode=CN
 * data_source：osm-self-drive-supply
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  IcelandCanonicalTypeValue,
  OSM_SUPPLY_TAG_RULES,
  resolveCanonicalFromOsmTags,
  toPrismaPlaceCategory,
  PrismaPlaceCategory,
} from '../src/places/types/iceland-poi-categories';

loadEnv();

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const ROUTE_ARG =
  process.argv.find((a) => a.startsWith('--route='))?.split('=')[1]?.trim() ||
  'g318';
const LIMIT_PER_ANCHOR = Number(
  process.argv.find((a) => a.startsWith('--limit-per-anchor='))?.split('=')[1] ??
    20,
);
const RADIUS_M = Number(
  process.argv.find((a) => a.startsWith('--radius='))?.split('=')[1] ?? 20000,
);
const DELAY_MS = Number(process.env.CN_OSM_SUPPLY_DELAY_MS ?? 2000);
const TYPES_FILTER = new Set(
  (
    process.argv.find((a) => a.startsWith('--types='))?.split('=')[1] ?? ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);
const ANCHORS_FILTER = new Set(
  (
    process.argv.find((a) => a.startsWith('--anchors='))?.split('=')[1] ?? ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

const OVERPASS_ENDPOINTS = (
  process.env.CN_OVERPASS_URLS ||
  [
    'https://overpass-api.de/api/interpreter',
    'https://lz4.overpass-api.de/api/interpreter',
    'https://overpass.kumi.systems/api/interpreter',
  ].join(',')
)
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

type SeedCity = {
  name: string;
  nameCN: string;
  nameEN: string;
  lat: number;
  lng: number;
};

type SeedPlace = {
  nameCN: string;
  cityCN: string;
  lat: number;
  lng: number;
};

type Anchor = {
  nameCN: string;
  lat: number;
  lng: number;
  cityCN: string;
};

type ClassicRoute = {
  id: string;
  aliases?: string[];
  nameCN: string;
  anchorPlaces?: string[];
};

type OsmElement = {
  type: 'node' | 'way' | 'relation';
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
};

type Candidate = {
  osmKey: string;
  osmType: string;
  osmId: number;
  nameCN: string;
  nameEN?: string;
  lat: number;
  lng: number;
  address?: string;
  canonicalType: IcelandCanonicalTypeValue;
  category: PrismaPlaceCategory;
  anchorCN: string;
  routeId: string;
  queryKey: string;
  rawTags: Record<string, string>;
  distanceM: number;
};

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function haversineM(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

function resolveRoutes(routes: ClassicRoute[], routeArg: string): ClassicRoute[] {
  const key = routeArg.toLowerCase();
  if (key === 'all') return routes;
  const hit = routes.filter((r) => {
    const idTail = r.id.replace(/^cn\.route\./, '').toLowerCase();
    if (idTail === key || r.id.toLowerCase() === key) return true;
    if (key === 'qinggan' && idTail.includes('qinggan')) return true;
    return (r.aliases || []).some((a) => a.toLowerCase() === key);
  });
  if (!hit.length) {
    throw new Error(
      `未知 --route=${routeArg}；可选: all | ${routes
        .map((r) => r.id.replace(/^cn\.route\./, ''))
        .join(' | ')}`,
    );
  }
  return hit;
}

function matchAnchor(
  anchorName: string,
  cities: SeedCity[],
  places: SeedPlace[],
): Anchor | null {
  const exactCity = cities.find((c) => c.nameCN === anchorName);
  if (exactCity) {
    return {
      nameCN: exactCity.nameCN,
      lat: exactCity.lat,
      lng: exactCity.lng,
      cityCN: exactCity.nameCN,
    };
  }
  const softCity = cities.find(
    (c) =>
      c.nameCN.includes(anchorName) ||
      anchorName.includes(c.nameCN) ||
      c.nameEN.toLowerCase() === anchorName.toLowerCase(),
  );
  if (softCity) {
    return {
      nameCN: softCity.nameCN,
      lat: softCity.lat,
      lng: softCity.lng,
      cityCN: softCity.nameCN,
    };
  }
  const place =
    places.find((p) => p.nameCN === anchorName) ||
    places.find(
      (p) => p.nameCN.includes(anchorName) || anchorName.includes(p.nameCN),
    );
  if (place) {
    return {
      nameCN: anchorName,
      lat: place.lat,
      lng: place.lng,
      cityCN: place.cityCN,
    };
  }
  return null;
}

function activeRules() {
  return OSM_SUPPLY_TAG_RULES.filter(
    (r) => !TYPES_FILTER.size || TYPES_FILTER.has(r.queryKey),
  );
}

function buildAroundQuery(
  lat: number,
  lng: number,
  rules = activeRules(),
): string {
  const parts = rules.flatMap((r) => [
    `  node["${r.osmKey}"="${r.osmValue}"](around:${RADIUS_M},${lat},${lng});`,
    `  way["${r.osmKey}"="${r.osmValue}"](around:${RADIUS_M},${lat},${lng});`,
    `  relation["${r.osmKey}"="${r.osmValue}"](around:${RADIUS_M},${lat},${lng});`,
  ]);
  return `
[out:json][timeout:90];
(
${parts.join('\n')}
);
out center tags;
`.trim();
}

/** 全量查询失败时按组拆分，降低 Overpass 超时概率 */
function ruleBatches() {
  const rules = activeRules();
  const groups: string[][] = [
    ['fuel', 'charging'],
    ['parking', 'highway_services'],
    ['supermarket', 'convenience', 'toilets'],
    ['car_repair', 'camping', 'hospital'],
    ['toll', 'sanitary_dump'],
  ];
  const batches: (typeof rules)[] = [];
  for (const keys of groups) {
    const batch = rules.filter((r) => keys.includes(r.queryKey));
    if (batch.length) batches.push(batch);
  }
  const covered = new Set(batches.flatMap((b) => b.map((r) => r.key)));
  const rest = rules.filter((r) => !covered.has(r.key));
  if (rest.length) batches.push(rest);
  return batches;
}

function queryKeyForTags(tags: Record<string, string>): string {
  for (const rule of OSM_SUPPLY_TAG_RULES) {
    if (tags[rule.osmKey] === rule.osmValue) return rule.queryKey;
  }
  return 'other';
}

function displayName(tags: Record<string, string>, canonical: string): {
  nameCN: string;
  nameEN?: string;
} {
  const nameCN =
    tags['name:zh'] ||
    tags['name:zh-Hans'] ||
    tags.name ||
    tags['name:en'] ||
    canonical;
  const nameEN = tags['name:en'] || tags.name || undefined;
  return { nameCN, nameEN };
}

function addressFromTags(tags: Record<string, string>): string | undefined {
  const parts = [
    tags['addr:province'],
    tags['addr:city'],
    tags['addr:district'],
    tags['addr:street'],
    tags['addr:housenumber'],
  ].filter(Boolean);
  if (parts.length) return parts.join('');
  return tags['addr:full'] || undefined;
}

async function overpassQuery(query: string): Promise<OsmElement[]> {
  let lastErr: unknown;
  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const { data, status } = await axios.post(
        endpoint,
        `data=${encodeURIComponent(query)}`,
        {
          timeout: 120_000,
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'User-Agent': 'TripNARA/1.0 (cn-self-drive-supply; contact=dev)',
          },
          proxy: false,
          validateStatus: () => true,
          // 优先 IPv4，避免部分环境 IPv6 ENETUNREACH
          family: 4,
        },
      );
      if (status === 429 || status === 504 || status === 502) {
        throw new Error(`HTTP ${status}`);
      }
      if (status >= 400) {
        throw new Error(`HTTP ${status}`);
      }
      if (typeof data === 'string') {
        throw new Error(`non-json body (${data.slice(0, 80)})`);
      }
      if (data?.remark && !data?.elements) {
        throw new Error(String(data.remark));
      }
      if (!Array.isArray(data?.elements)) {
        throw new Error(`unexpected response from ${endpoint}`);
      }
      return data.elements as OsmElement[];
    } catch (e) {
      lastErr = e;
      console.warn(
        `  ⚠️  Overpass 失败 ${endpoint}: ${(e as Error)?.message || e}`,
      );
      await sleep(1200);
    }
  }
  throw lastErr instanceof Error
    ? lastErr
    : new Error(`全部 Overpass 端点失败: ${String(lastErr)}`);
}

async function fetchAroundAnchor(
  lat: number,
  lng: number,
): Promise<OsmElement[]> {
  try {
    return await overpassQuery(buildAroundQuery(lat, lng));
  } catch (e) {
    console.warn(
      `  ⚠️  全量查询失败，改分组重试: ${(e as Error)?.message || e}`,
    );
    const all: OsmElement[] = [];
    const seen = new Set<string>();
    for (const batch of ruleBatches()) {
      try {
        const els = await overpassQuery(buildAroundQuery(lat, lng, batch));
        await sleep(DELAY_MS);
        for (const el of els) {
          const k = `${el.type}/${el.id}`;
          if (seen.has(k)) continue;
          seen.add(k);
          all.push(el);
        }
      } catch (batchErr) {
        console.warn(
          `  ⚠️  分组失败 [${batch.map((r) => r.queryKey).join(',')}]: ${(batchErr as Error)?.message || batchErr}`,
        );
        await sleep(DELAY_MS);
      }
    }
    return all;
  }
}

async function resolveCityId(
  cityCN: string,
  cache: Map<string, number>,
): Promise<number | null> {
  if (cache.has(cityCN)) return cache.get(cityCN)!;
  const city = await prisma.city.findFirst({
    where: {
      countryCode: 'CN',
      OR: [
        { nameCN: cityCN },
        { nameCN: { contains: cityCN } },
        { name: cityCN },
      ],
    },
    select: { id: true },
  });
  if (city) cache.set(cityCN, city.id);
  return city?.id ?? null;
}

async function findByOsm(
  osmType: string,
  osmId: number,
): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT p.id
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'CN'
      AND p.metadata->>'osmType' = ${osmType}
      AND p.metadata->>'osmId' = ${String(osmId)}
    LIMIT 1
  `;
  return rows[0]?.id ?? null;
}

async function upsertCandidate(
  c: Candidate,
  cityId: number | null,
): Promise<'created' | 'updated' | 'skipped'> {
  if (!cityId) return 'skipped';

  const metadata = {
    countryCode: 'CN',
    osmType: c.osmType,
    osmId: String(c.osmId),
    osmKey: c.osmKey,
    canonicalType: c.canonicalType,
    coordinates: { lat: c.lat, lng: c.lng },
    classicRouteId: c.routeId,
    supplyAnchor: c.anchorCN,
    supplyQueryKey: c.queryKey,
    rawTags: c.rawTags,
    dataSource: 'osm-self-drive-supply',
  };

  if (DRY) return 'created';

  const existingId = await findByOsm(c.osmType, c.osmId);
  if (existingId) {
    await prisma.$executeRaw`
      UPDATE "Place"
      SET
        location = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
        "cityId" = ${cityId},
        category = ${c.category}::"PlaceCategory",
        "nameCN" = ${c.nameCN},
        "nameEN" = ${c.nameEN ?? c.nameCN},
        address = ${c.address ?? null},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
        data_source = 'osm-self-drive-supply',
        "updatedAt" = NOW()
      WHERE id = ${existingId}
    `;
    return 'updated';
  }

  const uuid = `cn-osm-supply-${c.osmType}${c.osmId}-${randomUUID().slice(0, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO "Place" (
      uuid, "nameEN", "nameCN", category, location, "cityId",
      address, rating, metadata, data_source, "createdAt", "updatedAt"
    ) VALUES (
      ${uuid},
      ${c.nameEN ?? c.nameCN},
      ${c.nameCN},
      ${c.category}::"PlaceCategory",
      ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
      ${cityId},
      ${c.address ?? null},
      0,
      ${JSON.stringify(metadata)}::jsonb,
      'osm-self-drive-supply',
      NOW(),
      NOW()
    )
  `;
  return 'created';
}

function elementsToCandidates(
  elements: OsmElement[],
  anchor: Anchor,
  routeId: string,
): Candidate[] {
  const byQuery = new Map<string, Candidate[]>();

  for (const el of elements) {
    const tags = el.tags || {};
    const canonical = resolveCanonicalFromOsmTags(tags);
    if (!canonical) continue;
    const lat = el.center?.lat ?? el.lat;
    const lng = el.center?.lon ?? el.lon;
    if (lat == null || lng == null) continue;
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) continue;

    const qk = queryKeyForTags(tags);
    if (TYPES_FILTER.size && !TYPES_FILTER.has(qk)) continue;

    const { nameCN, nameEN } = displayName(tags, canonical);
    const distanceM = haversineM(anchor.lat, anchor.lng, lat, lng);
    const cand: Candidate = {
      osmKey: `${el.type}/${el.id}`,
      osmType: el.type,
      osmId: el.id,
      nameCN,
      nameEN,
      lat,
      lng,
      address: addressFromTags(tags),
      canonicalType: canonical,
      category: toPrismaPlaceCategory(canonical),
      anchorCN: anchor.cityCN,
      routeId,
      queryKey: qk,
      rawTags: tags,
      distanceM,
    };
    const list = byQuery.get(qk) || [];
    list.push(cand);
    byQuery.set(qk, list);
  }

  const out: Candidate[] = [];
  for (const [, list] of byQuery) {
    list.sort((a, b) => a.distanceM - b.distanceM);
    out.push(...list.slice(0, LIMIT_PER_ANCHOR));
  }
  return out;
}

async function main() {
  const seedPath = join(
    process.cwd(),
    'data/country-packs/CN/classic-route-places.seed.v1.json',
  );
  const routesPath = join(
    process.cwd(),
    'data/country-packs/CN/classic-self-drive-routes.v1.json',
  );
  if (!existsSync(seedPath) || !existsSync(routesPath)) {
    throw new Error('缺少 classic-route seed 或 classic-self-drive-routes');
  }

  const seed = JSON.parse(readFileSync(seedPath, 'utf-8')) as {
    cities: SeedCity[];
    places: SeedPlace[];
  };
  const routesFile = JSON.parse(readFileSync(routesPath, 'utf-8')) as {
    routes: ClassicRoute[];
  };
  const routes = resolveRoutes(routesFile.routes, ROUTE_ARG);
  const rules = activeRules();

  console.log(
    `\n=== CN 自驾补给 OSM/Overpass 导入（主源）===\n` +
      `routes=${routes.map((r) => r.id).join(', ')}\n` +
      `queries=${[...new Set(rules.map((r) => r.queryKey))].join(', ')}\n` +
      `radius=${RADIUS_M}m limitPerAnchor=${LIMIT_PER_ANCHOR}` +
      `${DRY ? ' DRY-RUN' : ''}\n`,
  );

  const candidates: Candidate[] = [];
  const seenOsm = new Set<string>();
  const errors: Array<{ anchor: string; info: string }> = [];
  const cityCache = new Map<string, number>();

  for (const route of routes) {
    for (const anchorName of route.anchorPlaces ?? []) {
      if (
        ANCHORS_FILTER.size &&
        !ANCHORS_FILTER.has(anchorName) &&
        ![...ANCHORS_FILTER].some(
          (a) => anchorName.includes(a) || a.includes(anchorName),
        )
      ) {
        continue;
      }
      const anchor = matchAnchor(anchorName, seed.cities, seed.places ?? []);
      if (!anchor) {
        console.warn(`  ⚠️  无坐标锚点，跳过: ${route.id} / ${anchorName}`);
        continue;
      }
      console.log(
        `\n▶ ${route.id} @ ${anchor.nameCN} → city=${anchor.cityCN} (${anchor.lat},${anchor.lng})`,
      );

      try {
        const elements = await fetchAroundAnchor(anchor.lat, anchor.lng);
        await sleep(DELAY_MS);
        const batch = elementsToCandidates(elements, anchor, route.id);
        let added = 0;
        const perType: Record<string, number> = {};
        for (const c of batch) {
          if (seenOsm.has(c.osmKey)) continue;
          seenOsm.add(c.osmKey);
          candidates.push(c);
          added++;
          perType[c.queryKey] = (perType[c.queryKey] || 0) + 1;
        }
        console.log(`  · +${added} ${JSON.stringify(perType)}`);
      } catch (e) {
        const info = (e as Error)?.message || String(e);
        errors.push({ anchor: anchor.nameCN, info });
        console.warn(`  ⚠️  ${info}`);
      }
    }
  }

  let created = 0;
  let updated = 0;
  let skipped = 0;
  for (const c of candidates) {
    const cityId = await resolveCityId(c.anchorCN, cityCache);
    const r = await upsertCandidate(c, cityId);
    if (r === 'created') created++;
    else if (r === 'updated') updated++;
    else skipped++;
  }

  const byType: Record<string, number> = {};
  for (const c of candidates) {
    byType[c.canonicalType] = (byType[c.canonicalType] || 0) + 1;
  }

  const auditDir = join(process.cwd(), 'data/country-packs/CN/audits');
  mkdirSync(auditDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const auditPath = join(
    auditDir,
    `china-self-drive-supply-osm.${stamp}.json`,
  );
  const audit = {
    at: new Date().toISOString(),
    dryRun: DRY,
    source: 'osm-overpass',
    routeArg: ROUTE_ARG,
    routes: routes.map((r) => r.id),
    radiusM: RADIUS_M,
    limitPerAnchor: LIMIT_PER_ANCHOR,
    queries: [...new Set(rules.map((r) => r.queryKey))],
    candidateCount: candidates.length,
    byCanonicalType: byType,
    created,
    updated,
    skipped,
    errors,
    sample: candidates.slice(0, 40).map((c) => ({
      osmKey: c.osmKey,
      nameCN: c.nameCN,
      canonicalType: c.canonicalType,
      category: c.category,
      anchorCN: c.anchorCN,
      routeId: c.routeId,
    })),
  };
  writeFileSync(auditPath, JSON.stringify(audit, null, 2));

  console.log('\n================================');
  console.log(`candidates=${candidates.length}`);
  console.log(`byType=${JSON.stringify(byType)}`);
  console.log(
    DRY
      ? `(dry-run) would write created≈${created} skipped=${skipped}`
      : `written: created=${created}, updated=${updated}, skipped=${skipped}`,
  );
  console.log(`audit: ${auditPath}`);
  console.log('================================\n');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
