#!/usr/bin/env npx tsx
/**
 * 高德复核 G211 银榕线主要过夜枢纽。
 *
 *   npx tsx scripts/verify-g211-amap-coords.ts --apply
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

loadEnv();

const APPLY = process.argv.includes('--apply');
const THRESHOLD_KM = Number(process.env.G211_COORD_APPLY_KM ?? 3);
const SEED_PATH = join(
  process.cwd(),
  'data/country-packs/CN/classic-route-places.seed.v1.json',
);
const OUT_PATH = join(
  process.cwd(),
  'data/country-packs/CN/audits',
  `g211-amap-coords.${new Date().toISOString().slice(0, 10)}.json`,
);

const TARGETS: Array<{ nameCN: string; city?: string; alt?: string }> = [
  { nameCN: '银川', city: '银川', alt: '银川市' },
  { nameCN: '庆阳', city: '庆阳', alt: '庆阳市' },
  { nameCN: '西安', city: '西安', alt: '西安市' },
  { nameCN: '商洛', city: '商洛', alt: '商洛市' },
  { nameCN: '安康', city: '安康', alt: '安康市' },
  { nameCN: '万州', city: '重庆', alt: '万州区' },
  { nameCN: '沿河', city: '铜仁', alt: '沿河土家族自治县' },
  { nameCN: '镇远古镇', city: '黔东南', alt: '镇远古镇' },
  { nameCN: '榕江', city: '黔东南', alt: '榕江县' },
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

function findSeedCoords(seed: any, nameCN: string) {
  const place = (seed.places || []).find((p: any) => p.nameCN === nameCN);
  if (place) return { lat: place.lat, lng: place.lng, where: 'place' as const };
  const city = (seed.cities || []).find((c: any) => c.nameCN === nameCN);
  if (city) return { lat: city.lat, lng: city.lng, where: 'city' as const };
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
    if (p.nameCN === nameCN) {
      p.lat = lat;
      p.lng = lng;
      n++;
    }
  }
  return n;
}

const round6 = (n: number) => Math.round(n * 1e6) / 1e6;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
      amap = await amapTextSearch(key, t.alt || t.nameCN, t.city);
      if (!amap && t.alt) amap = await amapTextSearch(key, t.nameCN, t.city);
      if (!amap) amap = await amapTextSearch(key, t.alt || t.nameCN);
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
    if (shouldApply) applyCoords(seed, t.nameCN, round6(amap.lat), round6(amap.lng));
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
    maxDeltaKm: Math.max(0, ...rows.filter((r) => r.ok).map((r) => Number(r.deltaKm) || 0)),
    appliedCount: rows.filter((r) => r.applied).length,
    thresholdKm: THRESHOLD_KM,
    apply: APPLY,
  };

  mkdirSync(dirname(OUT_PATH), { recursive: true });
  writeFileSync(
    OUT_PATH,
    JSON.stringify(
      {
        metadata: {
          version: '1.0.0',
          sampledAt: new Date().toISOString(),
          source: 'restapi.amap.com/v3/place/text',
          corridor: 'cn.route.g211',
          disclaimer: '高德 POI 文本搜首条。',
        },
        summary,
        rows,
      },
      null,
      2,
    ),
    'utf8',
  );
  console.log(`\nWrote ${OUT_PATH}`);
  console.log(JSON.stringify(summary, null, 2));

  if (APPLY) {
    seed.metadata = {
      ...seed.metadata,
      version: '1.3.2',
      updatedAt: new Date().toISOString().slice(0, 10),
      g211AmapVerifiedAt: new Date().toISOString(),
      g211AmapAudit: OUT_PATH.replace(process.cwd() + '/', ''),
      disclaimer:
        '坐标经高德 POI 文本搜复核（见 audits/*-amap-coords.*）；仍非测绘级精度。',
    };
    writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');
    console.log(`Updated seed ${SEED_PATH}`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
