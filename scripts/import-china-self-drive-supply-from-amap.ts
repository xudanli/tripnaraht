#!/usr/bin/env npx tsx
/**
 * 【可选】高德 enrich：沿经典线锚点 place/around 补自驾补给 POI。
 * CN 冷启动主源请用：scripts/import-china-self-drive-supply-from-osm.ts
 *
 *   npx tsx scripts/import-china-self-drive-supply-from-amap.ts --route=g318 --dry-run
 *   npx tsx scripts/import-china-self-drive-supply-from-amap.ts --route=all --limit-per-anchor=20
 *   npx tsx scripts/import-china-self-drive-supply-from-amap.ts --route=qinggan --types=fuel,charging,parking
 *
 * 需要 AMAP_API_KEY（.env）
 * 幂等键：metadata.amapId + countryCode=CN
 * data_source：amap-self-drive-supply
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { randomUUID } from 'crypto';
import { PrismaClient } from '@prisma/client';
import {
  IcelandCanonicalType,
  IcelandCanonicalTypeValue,
  resolveCanonicalFromAmapTypecode,
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
const DELAY_MS = Number(process.env.CN_AMAP_SUPPLY_DELAY_MS ?? 280);
const TYPES_FILTER = new Set(
  (
    process.argv.find((a) => a.startsWith('--types='))?.split('=')[1] ?? ''
  )
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
);

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
  /** 用于绑定 Place.cityId 的城市名 */
  cityCN: string;
};

type ClassicRoute = {
  id: string;
  aliases?: string[];
  nameCN: string;
  anchorPlaces?: string[];
};

type QuerySpec = {
  key: string;
  types?: string;
  keywords?: string;
  /** 强制 canonical（覆盖 typecode 推断） */
  forceCanonical?: IcelandCanonicalTypeValue;
  /** 名称须匹配其一才保留（营地等） */
  nameMustMatch?: RegExp;
};

const QUERY_SPECS: QuerySpec[] = [
  { key: 'fuel', types: '010100' },
  { key: 'charging', types: '011100' },
  { key: 'parking', types: '150900' },
  {
    key: 'highway_services',
    // typecode 因版本差异不稳定；关键词 + 名称过滤更稳
    keywords: '服务区',
    forceCanonical: IcelandCanonicalType.HIGHWAY_SERVICES,
    nameMustMatch: /服务区/,
  },
  { key: 'supermarket', types: '060400' },
  { key: 'convenience', types: '060200' },
  { key: 'toilets', types: '200300' },
  { key: 'car_repair', types: '030000' },
  {
    key: 'camping',
    keywords: '营地',
    forceCanonical: IcelandCanonicalType.CAMPING,
    nameMustMatch: /营地|露营|房车/,
  },
  { key: 'hospital', types: '090100' },
];

type AmapPoi = {
  id: string;
  name: string;
  type?: string;
  typecode?: string;
  address?: string | string[];
  location?: string;
  tel?: string | string[];
  pname?: string;
  cityname?: string;
  adname?: string;
};

type Candidate = {
  amapId: string;
  nameCN: string;
  lat: number;
  lng: number;
  address?: string;
  typecode?: string;
  amapType?: string;
  canonicalType: IcelandCanonicalTypeValue;
  category: PrismaPlaceCategory;
  anchorCN: string;
  routeId: string;
  queryKey: string;
};

function argKey(): string {
  return (process.env.AMAP_API_KEY || '').replace(/^["']|["']$/g, '').trim();
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

function parseLocation(loc: string | undefined): { lat: number; lng: number } | null {
  if (!loc || typeof loc !== 'string') return null;
  const [lngS, latS] = loc.split(',');
  const lng = Number(lngS);
  const lat = Number(latS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

function addrOf(v: string | string[] | undefined): string | undefined {
  if (typeof v === 'string' && v.trim()) return v.trim();
  if (Array.isArray(v) && v[0]) return String(v[0]);
  return undefined;
}

function resolveRoutes(routes: ClassicRoute[], routeArg: string): ClassicRoute[] {
  const key = routeArg.toLowerCase();
  if (key === 'all') return routes;
  const hit = routes.filter((r) => {
    const idTail = r.id.replace(/^cn\.route\./, '').toLowerCase();
    if (idTail === key || r.id.toLowerCase() === key) return true;
    if (key === 'qinggan' && idTail.includes('qinggan')) return true;
    if (key === 'g318' && idTail === 'g318') return true;
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

function resolveCanonical(
  poi: AmapPoi,
  spec: QuerySpec,
): IcelandCanonicalTypeValue | null {
  if (spec.forceCanonical) return spec.forceCanonical;
  const fromCode = resolveCanonicalFromAmapTypecode(poi.typecode);
  if (fromCode) return fromCode;
  const name = String(poi.name || '');
  const type = String(poi.type || '');
  if (/充电|换电/.test(name) || /充电/.test(type)) {
    return IcelandCanonicalType.EV_CHARGING;
  }
  if (/加油|加气/.test(name) || /加油/.test(type)) {
    return IcelandCanonicalType.FUEL_STATION;
  }
  if (/服务区/.test(name)) return IcelandCanonicalType.HIGHWAY_SERVICES;
  if (/营地|露营|房车/.test(name)) return IcelandCanonicalType.CAMPING;
  if (/厕所|卫生间/.test(name)) return IcelandCanonicalType.TOILETS;
  if (/医院/.test(name)) return IcelandCanonicalType.HOSPITAL;
  if (/维修|汽修|轮胎/.test(name)) return IcelandCanonicalType.CAR_REPAIR;
  return null;
}

async function amapAround(
  key: string,
  lat: number,
  lng: number,
  spec: QuerySpec,
  page: number,
): Promise<{ pois: AmapPoi[]; count: number; info?: string }> {
  const params: Record<string, string | number> = {
    key,
    location: `${lng},${lat}`,
    radius: RADIUS_M,
    offset: Math.min(25, LIMIT_PER_ANCHOR),
    page,
    extensions: 'base',
    sortrule: 'distance',
  };
  if (spec.types) params.types = spec.types;
  if (spec.keywords) params.keywords = spec.keywords;

  const { data } = await axios.get('https://restapi.amap.com/v3/place/around', {
    params,
    timeout: 15_000,
    proxy: false,
  });

  const info = String(data?.info || data?.infocode || '');
  if (String(data?.status) !== '1') {
    return { pois: [], count: 0, info: info || `status=${data?.status}` };
  }
  const pois = Array.isArray(data?.pois) ? (data.pois as AmapPoi[]) : [];
  const count = Number(data?.count ?? pois.length) || pois.length;
  return { pois, count, info };
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

async function findByAmapId(amapId: string): Promise<number | null> {
  const rows = await prisma.$queryRaw<Array<{ id: number }>>`
    SELECT p.id
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'CN'
      AND p.metadata->>'amapId' = ${amapId}
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
    amapId: c.amapId,
    canonicalType: c.canonicalType,
    amapTypecode: c.typecode ?? null,
    amapType: c.amapType ?? null,
    coordinates: { lat: c.lat, lng: c.lng },
    classicRouteId: c.routeId,
    supplyAnchor: c.anchorCN,
    supplyQueryKey: c.queryKey,
    dataSource: 'amap-self-drive-supply',
  };

  if (DRY) return 'created';

  const existingId = await findByAmapId(c.amapId);
  if (existingId) {
    await prisma.$executeRaw`
      UPDATE "Place"
      SET
        location = ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
        "cityId" = ${cityId},
        category = ${c.category}::"PlaceCategory",
        "nameCN" = ${c.nameCN},
        address = ${c.address ?? null},
        metadata = COALESCE(metadata, '{}'::jsonb) || ${JSON.stringify(metadata)}::jsonb,
        data_source = 'amap-self-drive-supply',
        "updatedAt" = NOW()
      WHERE id = ${existingId}
    `;
    return 'updated';
  }

  const uuid = `cn-supply-${c.amapId}-${randomUUID().slice(0, 8)}`;
  await prisma.$executeRaw`
    INSERT INTO "Place" (
      uuid, "nameEN", "nameCN", category, location, "cityId",
      address, rating, metadata, data_source, "createdAt", "updatedAt"
    ) VALUES (
      ${uuid},
      ${c.nameCN},
      ${c.nameCN},
      ${c.category}::"PlaceCategory",
      ST_SetSRID(ST_MakePoint(${c.lng}, ${c.lat}), 4326)::geography,
      ${cityId},
      ${c.address ?? null},
      0,
      ${JSON.stringify(metadata)}::jsonb,
      'amap-self-drive-supply',
      NOW(),
      NOW()
    )
  `;
  return 'created';
}

async function main() {
  const key = argKey();
  if (!key) throw new Error('AMAP_API_KEY 未配置');

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
  const specs = QUERY_SPECS.filter(
    (s) => !TYPES_FILTER.size || TYPES_FILTER.has(s.key),
  );

  console.log(
    `\n=== CN 自驾补给高德导入 ===\n` +
      `routes=${routes.map((r) => r.id).join(', ')}\n` +
      `queries=${specs.map((s) => s.key).join(', ')}\n` +
      `radius=${RADIUS_M}m limitPerAnchor=${LIMIT_PER_ANCHOR}` +
      `${DRY ? ' DRY-RUN' : ''}\n`,
  );

  const candidates: Candidate[] = [];
  const seenAmap = new Set<string>();
  const errors: Array<{ anchor: string; query: string; info: string }> = [];
  const cityCache = new Map<string, number>();

  for (const route of routes) {
    const anchors = route.anchorPlaces ?? [];
    for (const anchorName of anchors) {
      const anchor = matchAnchor(anchorName, seed.cities, seed.places ?? []);
      if (!anchor) {
        console.warn(`  ⚠️  无坐标锚点，跳过: ${route.id} / ${anchorName}`);
        continue;
      }
      console.log(
        `\n▶ ${route.id} @ ${anchor.nameCN} → city=${anchor.cityCN} (${anchor.lat},${anchor.lng})`,
      );

      for (const spec of specs) {
        let collected = 0;
        let page = 1;
        while (collected < LIMIT_PER_ANCHOR) {
          const { pois, count, info } = await amapAround(
            key,
            anchor.lat,
            anchor.lng,
            spec,
            page,
          );
          await sleep(DELAY_MS);

          if (info && /OVER_LIMIT|INVALID|DAILY/i.test(info) && !pois.length) {
            errors.push({
              anchor: anchor.nameCN,
              query: spec.key,
              info,
            });
            console.warn(`  ⚠️  ${spec.key}: ${info}`);
            break;
          }
          if (!pois.length) break;

          for (const poi of pois) {
            if (collected >= LIMIT_PER_ANCHOR) break;
            if (!poi?.id || seenAmap.has(poi.id)) continue;
            if (spec.nameMustMatch && !spec.nameMustMatch.test(String(poi.name || ''))) {
              continue;
            }
            const coords = parseLocation(poi.location);
            if (!coords) continue;
            const canonical = resolveCanonical(poi, spec);
            if (!canonical) continue;

            seenAmap.add(poi.id);
            collected++;
            candidates.push({
              amapId: poi.id,
              nameCN: String(poi.name),
              lat: coords.lat,
              lng: coords.lng,
              address: addrOf(poi.address),
              typecode: poi.typecode,
              amapType: poi.type,
              canonicalType: canonical,
              category: toPrismaPlaceCategory(canonical),
              anchorCN: anchor.cityCN,
              routeId: route.id,
              queryKey: spec.key,
            });
          }

          if (pois.length < Math.min(25, LIMIT_PER_ANCHOR)) break;
          if (page * Math.min(25, LIMIT_PER_ANCHOR) >= count) break;
          page++;
        }
        console.log(`  · ${spec.key}: +${collected}`);
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
    `china-self-drive-supply-amap.${stamp}.json`,
  );
  const audit = {
    at: new Date().toISOString(),
    dryRun: DRY,
    routeArg: ROUTE_ARG,
    routes: routes.map((r) => r.id),
    radiusM: RADIUS_M,
    limitPerAnchor: LIMIT_PER_ANCHOR,
    queries: specs.map((s) => s.key),
    candidateCount: candidates.length,
    byCanonicalType: byType,
    created,
    updated,
    skipped,
    errors,
    sample: candidates.slice(0, 40).map((c) => ({
      amapId: c.amapId,
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
