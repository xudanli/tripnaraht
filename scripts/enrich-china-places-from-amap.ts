#!/usr/bin/env npx tsx
/**
 * 完善系统已有中国 Place（库内景点），用高德详情回填 metadata / address。
 * 不是扩 classic-route seed JSON，而是 UPDATE 已有行。
 *
 *   # 先看缺口
 *   npx tsx scripts/enrich-china-places-from-amap.ts --report
 *
 *   # 经典线 seed 景点优先（推荐首批）
 *   npx tsx scripts/enrich-china-places-from-amap.ts --classic-seed --limit=80
 *
 *   # 缺 amapId 的 CN 景点（可加大 limit）
 *   npx tsx scripts/enrich-china-places-from-amap.ts --missing-amap --limit=100
 *
 *   # 仅海拔字段归一：altitudeMeters → elevationMeters
 *   npx tsx scripts/enrich-china-places-from-amap.ts --normalize-altitude
 *
 *   npx tsx scripts/enrich-china-places-from-amap.ts --classic-seed --dry-run
 *
 * 需要 AMAP_API_KEY（.env）
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaClient, Prisma } from '@prisma/client';

loadEnv();

const prisma = new PrismaClient();
const DRY = process.argv.includes('--dry-run');
const REPORT = process.argv.includes('--report');
const CLASSIC = process.argv.includes('--classic-seed');
const MISSING = process.argv.includes('--missing-amap');
const NORM_ALT = process.argv.includes('--normalize-altitude');
const LIMIT = Number(
  process.argv.find((a) => a.startsWith('--limit='))?.split('=')[1] ?? 50,
);
const DELAY_MS = Number(process.env.CN_AMAP_ENRICH_DELAY_MS ?? 250);

type PlaceRow = {
  id: number;
  nameCN: string;
  address: string | null;
  description: string | null;
  metadata: any;
  lat: number | null;
  lng: number | null;
  cityCN: string | null;
};

function argKey(): string {
  return (process.env.AMAP_API_KEY || '').replace(/^["']|["']$/g, '').trim();
}

async function reportGaps() {
  const rows = await prisma.$queryRaw<
    Array<{
      total: number;
      attractions: number;
      with_amap: number;
      no_desc: number;
      no_en: number;
      classic_seed: number;
      classic_no_amap: number;
      alt_without_elev: number;
    }>
  >`
    SELECT
      COUNT(*)::int AS total,
      COUNT(*) FILTER (WHERE p.category = 'ATTRACTION')::int AS attractions,
      COUNT(*) FILTER (
        WHERE p.category = 'ATTRACTION'
          AND (p.metadata ? 'amapId' OR COALESCE(p.metadata->>'amapId','') <> '')
      )::int AS with_amap,
      COUNT(*) FILTER (
        WHERE p.category = 'ATTRACTION'
          AND (p.description IS NULL OR btrim(p.description) = '')
      )::int AS no_desc,
      COUNT(*) FILTER (
        WHERE p.category = 'ATTRACTION'
          AND (p."nameEN" IS NULL OR btrim(p."nameEN") = '')
      )::int AS no_en,
      COUNT(*) FILTER (WHERE p.data_source = 'classic-route-seed')::int AS classic_seed,
      COUNT(*) FILTER (
        WHERE p.data_source = 'classic-route-seed'
          AND p.category = 'ATTRACTION'
          AND NOT (p.metadata ? 'amapId')
      )::int AS classic_no_amap,
      COUNT(*) FILTER (
        WHERE (p.metadata ? 'altitudeMeters')
          AND (
            NOT (p.metadata ? 'elevationMeters')
            OR NULLIF(p.metadata->>'elevationMeters','') IS NULL
          )
      )::int AS alt_without_elev
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'CN'
  `;
  console.log('\n=== CN Place 缺口报表 ===');
  console.log(JSON.stringify(rows[0], null, 2));
  console.log('');
}

async function normalizeAltitude(): Promise<number> {
  const rows = await prisma.$queryRaw<Array<{ id: number; metadata: any }>>`
    SELECT p.id, p.metadata
    FROM "Place" p
    JOIN "City" c ON c.id = p."cityId"
    WHERE c."countryCode" = 'CN'
      AND (p.metadata ? 'altitudeMeters')
      AND (
        NOT (p.metadata ? 'elevationMeters')
        OR NULLIF(p.metadata->>'elevationMeters','') IS NULL
        OR ABS(
          COALESCE((p.metadata->>'elevationMeters')::float, -1)
          - (p.metadata->>'altitudeMeters')::float
        ) > 1
      )
  `;
  let n = 0;
  for (const r of rows) {
    const meta = (r.metadata || {}) as Record<string, unknown>;
    const alt = Number(meta.altitudeMeters);
    if (!Number.isFinite(alt)) continue;
    const next = {
      ...meta,
      elevationMeters: alt,
      altitudeSyncedAt: new Date().toISOString(),
    };
    if (DRY) {
      console.log(`  [DRY] altitude sync place#${r.id} → ${alt}m`);
    } else {
      await prisma.place.update({
        where: { id: r.id },
        data: { metadata: next as Prisma.InputJsonValue, updatedAt: new Date() },
      });
    }
    n++;
  }
  console.log(`Altitude normalize: ${n} places${DRY ? ' (dry-run)' : ''}`);
  return n;
}

async function loadCandidates(): Promise<PlaceRow[]> {
  if (CLASSIC) {
    return prisma.$queryRaw<PlaceRow[]>`
      SELECT
        p.id,
        p."nameCN",
        p.address,
        p.description,
        p.metadata,
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng,
        c."nameCN" AS "cityCN"
      FROM "Place" p
      JOIN "City" c ON c.id = p."cityId"
      WHERE c."countryCode" = 'CN'
        AND p.category = 'ATTRACTION'
        AND p.data_source = 'classic-route-seed'
        AND p.location IS NOT NULL
        AND NOT (p.metadata ? 'amapId')
      ORDER BY p.id
      LIMIT ${LIMIT}
    `;
  }
  if (MISSING) {
    return prisma.$queryRaw<PlaceRow[]>`
      SELECT
        p.id,
        p."nameCN",
        p.address,
        p.description,
        p.metadata,
        ST_Y(p.location::geometry) AS lat,
        ST_X(p.location::geometry) AS lng,
        c."nameCN" AS "cityCN"
      FROM "Place" p
      JOIN "City" c ON c.id = p."cityId"
      WHERE c."countryCode" = 'CN'
        AND p.category = 'ATTRACTION'
        AND p.location IS NOT NULL
        AND NOT (p.metadata ? 'amapId')
      ORDER BY
        CASE WHEN p.metadata->>'level' IN ('5A','4A') THEN 0 ELSE 1 END,
        p.rating DESC NULLS LAST,
        p.id
      LIMIT ${LIMIT}
    `;
  }
  throw new Error('请指定 --classic-seed 或 --missing-amap（或 --report / --normalize-altitude）');
}

async function amapSearchNear(
  key: string,
  name: string,
  lat: number,
  lng: number,
): Promise<any | null> {
  const { data } = await axios.get('https://restapi.amap.com/v3/place/text', {
    params: {
      key,
      keywords: name,
      location: `${lng},${lat}`,
      radius: 5000,
      offset: 3,
      page: 1,
      extensions: 'all',
    },
    timeout: 12_000,
    proxy: false,
  });
  if (String(data?.status) !== '1' || !Array.isArray(data?.pois) || !data.pois.length) {
    return null;
  }
  // 优先名称包含关系更近的
  const scored = data.pois.map((poi: any) => {
    const n = String(poi.name || '');
    let score = 0;
    if (n === name) score += 100;
    if (n.includes(name) || name.includes(n)) score += 50;
    return { poi, score };
  });
  scored.sort((a: any, b: any) => b.score - a.score);
  return scored[0]?.poi ?? data.pois[0];
}

async function amapDetail(key: string, id: string): Promise<any | null> {
  const { data } = await axios.get('https://restapi.amap.com/v3/place/detail', {
    params: { key, id, extensions: 'all' },
    timeout: 12_000,
    proxy: false,
  });
  if (String(data?.status) !== '1' || !Array.isArray(data?.pois) || !data.pois.length) {
    return null;
  }
  return data.pois[0];
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function enrichOne(key: string, place: PlaceRow) {
  if (place.lat == null || place.lng == null) {
    return { ok: false as const, error: 'no_coords' };
  }
  const hit = await amapSearchNear(key, place.nameCN, Number(place.lat), Number(place.lng));
  if (!hit?.id) return { ok: false as const, error: 'amap_miss' };

  const detail = (await amapDetail(key, hit.id)) || hit;
  const openingHours = detail.business_time || hit.business_time || undefined;
  const ticketPrice = detail.cost || hit.cost || undefined;
  const address =
    (typeof detail.address === 'string' && detail.address) ||
    (typeof hit.address === 'string' && hit.address) ||
    place.address ||
    undefined;
  const tel = detail.tel || hit.tel || undefined;
  const type = detail.type || hit.type || undefined;
  const tag = detail.tag || hit.tag;
  const highlights =
    typeof tag === 'string'
      ? tag.split(/[,，]/).map((t: string) => t.trim()).filter(Boolean)
      : Array.isArray(tag)
        ? tag
        : undefined;

  const meta = { ...(place.metadata || {}) };
  const basic = { ...(meta.basic || {}) };
  if (openingHours) {
    basic.openingHours = openingHours;
    meta.openingHours = openingHours;
  }
  if (ticketPrice) {
    basic.ticketPrice = ticketPrice;
    meta.ticketPrice = ticketPrice;
  }
  if (tel) {
    basic.contact = { ...(basic.contact || {}), phone: tel };
    meta.contact = { ...(meta.contact || {}), phone: tel };
  }
  if (type) {
    basic.type = type;
    meta.type = type;
  }
  if (highlights?.length) meta.highlights = highlights;
  if (address) meta.address = address;

  // 海拔归一
  if (meta.altitudeMeters != null && meta.elevationMeters == null) {
    meta.elevationMeters = meta.altitudeMeters;
  }

  meta.amapId = detail.id || hit.id;
  meta.amapName = detail.name || hit.name;
  meta.lastEnrichedAt = new Date().toISOString();
  meta.enrichSource = 'enrich-china-places-from-amap';

  // 无描述时用高德类型/标签拼短描述（非 LLM，便于检索与展示）
  let description: string | undefined;
  if (!place.description?.trim()) {
    const parts = [
      place.nameCN,
      type ? `类型：${String(type).replace(/;/g, ' / ')}` : '',
      highlights?.length ? `标签：${highlights.slice(0, 6).join('、')}` : '',
      openingHours ? `开放：${openingHours}` : '',
      ticketPrice ? `门票：${ticketPrice}` : '',
    ].filter(Boolean);
    if (parts.length >= 2) description = parts.join('。') + '。';
  }

  if (!DRY) {
    await prisma.place.update({
      where: { id: place.id },
      data: {
        metadata: meta as Prisma.InputJsonValue,
        address: address || place.address,
        ...(description ? { description } : {}),
        lastVerifiedAt: new Date(),
        dataFreshness: 'amap-enriched',
        updatedAt: new Date(),
      },
    });
  }

  return {
    ok: true as const,
    amapId: meta.amapId as string,
    amapName: meta.amapName as string,
    hasHours: Boolean(openingHours),
    hasTicket: Boolean(ticketPrice),
    address: address || null,
  };
}

async function main() {
  if (REPORT || (!CLASSIC && !MISSING && !NORM_ALT)) {
    await reportGaps();
    if (!CLASSIC && !MISSING && !NORM_ALT) return;
  }

  if (NORM_ALT) {
    await normalizeAltitude();
  }

  if (!CLASSIC && !MISSING) return;

  const key = argKey();
  if (!key) throw new Error('AMAP_API_KEY 未配置');

  const candidates = await loadCandidates();
  console.log(
    `Enriching ${candidates.length} CN attractions` +
      `${CLASSIC ? ' (classic-seed)' : ''}${MISSING ? ' (missing-amap)' : ''}` +
      `${DRY ? ' [dry-run]' : ''}...\n`,
  );

  const results: Record<string, unknown>[] = [];
  let ok = 0;
  let fail = 0;

  for (const place of candidates) {
    process.stdout.write(`→ #${place.id} ${place.nameCN} ... `);
    try {
      const r = await enrichOne(key, place);
      if (!r.ok) {
        fail++;
        console.log(r.error);
        results.push({ id: place.id, nameCN: place.nameCN, ok: false, error: r.error });
      } else {
        ok++;
        console.log(
          `OK ${r.amapName}` +
            `${r.hasHours ? ' hours' : ''}${r.hasTicket ? ' ticket' : ''}` +
            `${DRY ? ' (dry)' : ''}`,
        );
        results.push({ id: place.id, nameCN: place.nameCN, ...r });
      }
    } catch (e) {
      fail++;
      const msg = e instanceof Error ? e.message : String(e);
      console.log(`ERR ${msg}`);
      results.push({ id: place.id, nameCN: place.nameCN, ok: false, error: msg });
      if (msg.includes('USER_DAILY_QUERY_OVER_LIMIT') || msg.includes('OVER_LIMIT')) {
        console.warn('命中高德配额，停止本批');
        break;
      }
    }
    await sleep(DELAY_MS);
  }

  const summary = {
    mode: CLASSIC ? 'classic-seed' : 'missing-amap',
    dryRun: DRY,
    candidates: candidates.length,
    ok,
    fail,
    sampledAt: new Date().toISOString(),
  };

  const outDir = join(process.cwd(), 'data/country-packs/CN/audits');
  mkdirSync(outDir, { recursive: true });
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const outPath = join(outDir, `china-place-amap-enrich.${stamp}.json`);
  writeFileSync(outPath, JSON.stringify({ metadata: summary, results }, null, 2));
  console.log(`\nWrote ${outPath}`);
  console.log(JSON.stringify(summary, null, 2));
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
