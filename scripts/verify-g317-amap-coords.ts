#!/usr/bin/env npx tsx
/**
 * 高德复核 G317 川藏北线垭口 / 硬核补给点，写审计并可选回写 seed。
 *
 *   npx tsx scripts/verify-g317-amap-coords.ts
 *   npx tsx scripts/verify-g317-amap-coords.ts --apply
 */
import { config as loadEnv } from 'dotenv';
import axios from 'axios';
import { mkdirSync, readFileSync, writeFileSync } from 'fs';
import { dirname, join } from 'path';

loadEnv();

const APPLY = process.argv.includes('--apply');
const THRESHOLD_KM = Number(process.env.G317_COORD_APPLY_KM ?? 3);
const SEED_PATH = join(
  process.cwd(),
  'data/country-packs/CN/classic-route-places.seed.v1.json',
);
const OUT_PATH = join(
  process.cwd(),
  'data/country-packs/CN/audits',
  `g317-amap-coords.${new Date().toISOString().slice(0, 10)}.json`,
);

const TARGETS: Array<{ nameCN: string; city?: string; alt?: string }> = [
  { nameCN: '成都', city: '成都', alt: '成都市' },
  { nameCN: '马尔康', city: '马尔康', alt: '马尔康市' },
  { nameCN: '道孚', city: '道孚', alt: '道孚县' },
  { nameCN: '炉霍', city: '炉霍', alt: '炉霍县' },
  { nameCN: '雀儿山垭口', city: '德格', alt: '雀儿山垭口' },
  { nameCN: '德格', city: '德格', alt: '德格县' },
  { nameCN: '德格印经院', city: '德格', alt: '德格印经院' },
  { nameCN: '江达', city: '江达', alt: '江达县' },
  { nameCN: '昌都', city: '昌都', alt: '昌都市' },
  { nameCN: '丁青', city: '丁青', alt: '丁青县' },
  { nameCN: '比如', city: '比如', alt: '比如县' },
  { nameCN: '那曲', city: '那曲', alt: '那曲市' },
  { nameCN: '当雄', city: '当雄', alt: '当雄县' },
  { nameCN: '拉萨', city: '拉萨', alt: '拉萨市' },
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

type AmapHit = {
  lat: number;
  lng: number;
  name: string;
  address?: string;
  id?: string;
};

async function amapTextSearch(
  key: string,
  keywords: string,
  city?: string,
): Promise<{ hit: AmapHit | null; info?: string }> {
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
  const info = String(data?.info || data?.infocode || '');
  if (String(data?.status) !== '1' || !Array.isArray(data?.pois) || !data.pois.length) {
    return { hit: null, info: info || 'amap_empty' };
  }
  const poi = data.pois[0];
  const loc = String(poi.location ?? '');
  const [lngS, latS] = loc.split(',');
  const lat = Number(latS);
  const lng = Number(lngS);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { hit: null, info: 'bad_location' };
  }
  return {
    hit: {
      lat,
      lng,
      name: String(poi.name ?? keywords),
      address: Array.isArray(poi.address) ? poi.address[0] : poi.address,
      id: poi.id,
    },
    info,
  };
}

function findSeedCoords(seed: any, nameCN: string) {
  const place = (seed.places || []).find((p: any) => p.nameCN === nameCN);
  if (place) return { lat: place.lat, lng: place.lng, where: 'place' as const };
  const city = (seed.cities || []).find((c: any) => c.nameCN === nameCN);
  if (city) return { lat: city.lat, lng: city.lng, where: 'city' as const };
  if (nameCN === '雀儿山垭口') {
    const alias = (seed.places || []).find(
      (p: any) =>
        p.nameCN === '雀儿山' ||
        (Array.isArray(p.aliases) &&
          p.aliases.some((a: string) => String(a).includes('雀儿山'))),
    );
    if (alias) return { lat: alias.lat, lng: alias.lng, where: 'place' as const };
  }
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
  if (nameCN === '雀儿山垭口') {
    for (const p of seed.places || []) {
      if (p.nameCN === '雀儿山' || p.nameCN === '雀儿山垭口') {
        p.lat = lat;
        p.lng = lng;
        n++;
      }
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
    let amap: AmapHit | null = null;
    let amapInfo = '';
    try {
      let res = await amapTextSearch(key, t.alt || t.nameCN, t.city);
      amap = res.hit;
      amapInfo = res.info || '';
      if (!amap && t.alt) {
        res = await amapTextSearch(key, t.nameCN, t.city);
        amap = res.hit;
        amapInfo = res.info || amapInfo;
      }
      if (!amap) {
        res = await amapTextSearch(key, t.alt || t.nameCN);
        amap = res.hit;
        amapInfo = res.info || amapInfo;
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
      const err = !amap
        ? amapInfo.includes('OVER_LIMIT')
          ? 'amap_quota'
          : amapInfo || 'amap_miss'
        : 'seed_miss';
      rows.push({
        nameCN: t.nameCN,
        ok: false,
        seed: seedHit,
        amap,
        error: err,
        amapInfo: amapInfo || undefined,
      });
      console.log(err);
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
          corridor: 'cn.route.g317',
          disclaimer: '高德 POI 文本搜首条；垭口可能偏差大，须人工确认。',
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

  if (APPLY && summary.ok > 0) {
    seed.metadata = {
      ...seed.metadata,
      version: '1.3.3',
      updatedAt: new Date().toISOString().slice(0, 10),
      g317AmapVerifiedAt: new Date().toISOString(),
      g317AmapAudit: OUT_PATH.replace(process.cwd() + '/', ''),
      disclaimer:
        '坐标经高德 POI 文本搜复核（见 audits/*-amap-coords.*）；仍非测绘级精度。',
    };
    writeFileSync(SEED_PATH, JSON.stringify(seed, null, 2) + '\n', 'utf8');
    console.log(`Updated seed ${SEED_PATH}`);
  } else if (APPLY && summary.ok === 0) {
    console.log('Skip seed metadata update: no successful Amap hits');
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
