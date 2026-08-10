#!/usr/bin/env npx tsx
/**
 * 用高德文本搜复核 G318 过夜城/垭口/木格措坐标，写审计并可选回写 seed。
 *
 *   npx tsx scripts/verify-g318-amap-coords.ts
 *   npx tsx scripts/verify-g318-amap-coords.ts --apply   # 偏差≥阈值时回写 classic-route-places.seed
 *
 * 需要 AMAP_API_KEY（.env）
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

loadEnv();

const APPLY = process.argv.includes('--apply');
const THRESHOLD_KM = Number(process.env.G318_COORD_APPLY_KM ?? 3);
const SEED_PATH = join(
  process.cwd(),
  'data/country-packs/CN/classic-route-places.seed.v1.json',
);
const OUT_PATH = join(
  process.cwd(),
  'data/country-packs/CN/audits',
  `g318-amap-coords.${new Date().toISOString().slice(0, 10)}.json`,
);

/** G318 最小闭环锚点（name → city 限定） */
const TARGETS: Array<{ nameCN: string; city?: string; kind: 'city' | 'place' }> = [
  { nameCN: '成都', city: '成都', kind: 'city' },
  { nameCN: '康定', city: '康定', kind: 'city' },
  { nameCN: '木格措', city: '康定', kind: 'place' },
  { nameCN: '折多山', city: '康定', kind: 'place' },
  { nameCN: '新都桥', city: '康定', kind: 'city' },
  { nameCN: '理塘', city: '理塘', kind: 'city' },
  { nameCN: '芒康', city: '芒康', kind: 'city' },
  { nameCN: '波密', city: '林芝', kind: 'city' },
  { nameCN: '鲁朗', city: '林芝', kind: 'place' },
  { nameCN: '林芝', city: '林芝', kind: 'city' },
  { nameCN: '拉萨', city: '拉萨', kind: 'city' },
  { nameCN: '布达拉宫', city: '拉萨', kind: 'place' },
  { nameCN: '东达山', city: '昌都', kind: 'place' },
  { nameCN: '然乌湖', city: '波密', kind: 'place' },
  { nameCN: '巴松措', city: '林芝', kind: 'place' },
  { nameCN: '大昭寺', city: '拉萨', kind: 'place' },
  { nameCN: '八廓街', city: '拉萨', kind: 'place' },
  { nameCN: '米拉山口', city: '工布江达', kind: 'place' },
];

function haversineKm(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(s)));
}

async function amapTextSearch(
  key: string,
  keywords: string,
  city?: string,
): Promise<{ lat: number; lng: number; name: string; address?: string; id?: string } | null> {
  const params: Record<string, string> = {
    key,
    keywords,
    offset: '5',
    page: '1',
    extensions: 'base',
  };
  if (city) params.city = city;
  const { data } = await axios.get('https://restapi.amap.com/v3/place/text', {
    params,
    timeout: 12_000,
    // 本机若配了无效 HTTP_PROXY（如 127.0.0.1:9090）会 ECONNREFUSED
    proxy: false,
  });
  if (String(data?.status) !== '1' || !Array.isArray(data?.pois) || !data.pois.length) {
    return null;
  }
  const poi = data.pois[0];
  const loc = String(poi.location ?? '');
  const [lngS, latS] = loc.split(',');
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    name: String(poi.name ?? keywords),
    address: Array.isArray(poi.address) ? poi.address[0] : poi.address,
    id: poi.id,
  };
}

function findSeedCoords(
  seed: any,
  nameCN: string,
): { lat: number; lng: number; where: 'city' | 'place' } | null {
  const place = (seed.places || []).find((p: any) => p.nameCN === nameCN);
  if (place) return { lat: place.lat, lng: place.lng, where: 'place' };
  const city = (seed.cities || []).find((c: any) => c.nameCN === nameCN);
  if (city) return { lat: city.lat, lng: city.lng, where: 'city' };
  // 折多山 → 折多山垭口
  const alias = (seed.places || []).find(
    (p: any) =>
      p.nameCN.includes(nameCN) ||
      (Array.isArray(p.aliases) && p.aliases.some((a: string) => a.includes(nameCN))),
  );
  if (alias) return { lat: alias.lat, lng: alias.lng, where: 'place' };
  return null;
}

function applyCoords(seed: any, nameCN: string, lat: number, lng: number): number {
  let n = 0;
  for (const c of seed.cities || []) {
    if (c.nameCN === nameCN) {
      c.lat = lat;
      c.lng = lng;
      n++;
    }
  }
  for (const p of seed.places || []) {
    // 仅精确 nameCN，或 aliases 精确等于目标（避免「康定」误伤「康定情歌木格措」）
    const aliasHit =
      Array.isArray(p.aliases) &&
      p.aliases.some((a: string) => String(a) === nameCN);
    if (p.nameCN === nameCN || aliasHit) {
      p.lat = lat;
      p.lng = lng;
      n++;
    }
  }
  // 折多山 → 折多山垭口
  if (nameCN === '折多山') {
    for (const p of seed.places || []) {
      if (p.nameCN === '折多山垭口') {
        p.lat = lat;
        p.lng = lng;
        n++;
      }
    }
  }
  return n;
}

async function main() {
  const key = (process.env.AMAP_API_KEY || '').replace(/^["']|["']$/g, '').trim();
  if (!key) throw new Error('AMAP_API_KEY 未配置');

  const seed = JSON.parse(readFileSync(SEED_PATH, 'utf8'));
  const rows: Record<string, unknown>[] = [];

  for (const t of TARGETS) {
    process.stdout.write(`→ ${t.nameCN} ... `);
    const seedHit = findSeedCoords(seed, t.nameCN);
    let amap: Awaited<ReturnType<typeof amapTextSearch>> = null;
    try {
      amap = await amapTextSearch(key, t.nameCN, t.city);
      if (!amap && t.nameCN === '折多山') {
        amap = await amapTextSearch(key, '折多山垭口', t.city);
      }
      if (!amap && t.nameCN === '木格措') {
        amap = await amapTextSearch(key, '康定情歌木格措', t.city);
      }
    } catch (e) {
      rows.push({
        nameCN: t.nameCN,
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
      console.log('ERR');
      continue;
    }

    if (!amap || !seedHit) {
      rows.push({
        nameCN: t.nameCN,
        ok: false,
        seed: seedHit,
        amap,
        error: !amap ? 'amap_miss' : 'seed_miss',
      });
      console.log(!amap ? 'amap_miss' : 'seed_miss');
      continue;
    }

    const deltaKm = haversineKm(seedHit, amap);
    const shouldApply = APPLY && deltaKm >= THRESHOLD_KM;
    if (shouldApply) {
      applyCoords(seed, t.nameCN, round6(amap.lat), round6(amap.lng));
    }
    rows.push({
      nameCN: t.nameCN,
      ok: true,
      seed: { lat: seedHit.lat, lng: seedHit.lng, where: seedHit.where },
      amap: {
        lat: amap.lat,
        lng: amap.lng,
        name: amap.name,
        address: amap.address,
        id: amap.id,
      },
      deltaKm: Number(deltaKm.toFixed(3)),
      applied: shouldApply,
    });
    console.log(`Δ${deltaKm.toFixed(2)}km${shouldApply ? ' APPLIED' : ''}`);
    await sleep(200);
  }

  const summary = {
    targets: TARGETS.length,
    ok: rows.filter((r) => r.ok).length,
    miss: rows.filter((r) => !r.ok).length,
    maxDeltaKm: Math.max(
      0,
      ...rows.filter((r) => r.ok).map((r) => Number(r.deltaKm) || 0),
    ),
    appliedCount: rows.filter((r) => r.applied).length,
    thresholdKm: THRESHOLD_KM,
    apply: APPLY,
  };

  const doc = {
    metadata: {
      version: '1.0.0',
      sampledAt: new Date().toISOString(),
      source: 'restapi.amap.com/v3/place/text',
      disclaimer: '高德 POI 文本搜首条结果，非测绘院成果；垭口类可能偏差较大需人工确认。',
    },
    summary,
    rows,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(OUT_PATH, JSON.stringify(doc, null, 2), 'utf8');
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(JSON.stringify(summary, null, 2));

  if (APPLY && summary.appliedCount > 0) {
    seed.metadata = {
      ...seed.metadata,
      version: '1.2.0',
      updatedAt: new Date().toISOString().slice(0, 10),
      disclaimer:
        '坐标经高德 POI 文本搜复核（见 audits/g318-amap-coords.*）；仍非测绘级精度。',
      amapVerifiedAt: new Date().toISOString(),
      amapAudit: OUT_PATH.replace(process.cwd() + '/', ''),
    };
    writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');
    console.log(`Updated seed ${SEED_PATH}`);
  }
}

function round6(n: number): number {
  return Math.round(n * 1e6) / 1e6;
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
