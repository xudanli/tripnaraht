/**
 * 中国经典线热门点预订事实（G318 + 青甘等）— Country Pack 只读加载。
 * 文件名保留 g318 前缀以兼容既有 import；数据源可叠加多廊道 JSON。
 */
import * as fs from 'fs';
import * as path from 'path';

export type CnG318HotspotBooking = {
  id: string;
  nameCN: string;
  aliases?: string[];
  hubCityCN?: string;
  consultBlurbCN?: string;
  corridor?: string;
  booking?: {
    advanceBookingDaysHint?: { min?: number; recommended?: number; peakHoliday?: number };
    mustHintsCN?: string[];
    realNameRequired?: boolean;
  };
  priceBandsCNY?: Record<string, unknown>;
  openSeason?: Record<string, unknown>;
};

type FileShape = {
  metadata?: { disclaimer?: string; corridor?: string };
  hotspots: CnG318HotspotBooking[];
  lodgingNotes?: Array<{ hubCityCN: string; mustHintsCN?: string[] }>;
};

const HOTSPOT_FILES = [
  'data/country-packs/CN/g318-hotspot-booking.v1.json',
  'data/country-packs/CN/qinggan-hotspot-booking.v1.json',
  'data/country-packs/CN/duku-hotspot-booking.v1.json',
  'data/country-packs/CN/dianzang-hotspot-booking.v1.json',
  'data/country-packs/CN/g211-hotspot-booking.v1.json',
  'data/country-packs/CN/g219-hotspot-booking.v1.json',
] as const;

let cached: FileShape | null = null;

function loadFile(): FileShape {
  if (cached) return cached;
  const hotspots: CnG318HotspotBooking[] = [];
  let disclaimer: string | undefined;
  for (const rel of HOTSPOT_FILES) {
    const filePath = path.join(process.cwd(), rel);
    if (!fs.existsSync(filePath)) continue;
    const doc = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FileShape;
    if (!disclaimer && doc.metadata?.disclaimer) disclaimer = doc.metadata.disclaimer;
    const corridor = doc.metadata?.corridor;
    for (const h of doc.hotspots || []) {
      hotspots.push(corridor ? { ...h, corridor: h.corridor ?? corridor } : h);
    }
  }
  cached = { metadata: { disclaimer }, hotspots };
  return cached;
}

/** @internal 测试用：清空缓存以便热更新 JSON */
export function __resetCnHotspotBookingCacheForTests(): void {
  cached = null;
}

export function listCnG318HotspotBookings(): CnG318HotspotBooking[] {
  return loadFile().hotspots.slice();
}

export function matchCnG318HotspotBooking(message: string): CnG318HotspotBooking | null {
  const msg = String(message ?? '');
  if (!msg.trim()) return null;
  let best: { hit: CnG318HotspotBooking; score: number } | null = null;
  for (const h of listCnG318HotspotBookings()) {
    const names = [h.nameCN, ...(h.aliases ?? [])].filter(Boolean) as string[];
    for (const n of names) {
      if (!n || !msg.includes(n)) continue;
      const score = n.length;
      if (!best || score > best.score) best = { hit: h, score };
    }
  }
  return best?.hit ?? null;
}

export function cnG318HotspotBookingDisclaimer(): string {
  return (
    loadFile().metadata?.disclaimer ||
    '示意规则；以景区通告与飞猪实时商品为准。'
  );
}

/** 注入 activity_search_meta / 咨询附注的轻量摘要 */
export function buildCnG318HotspotBookingMeta(
  message: string,
): Record<string, unknown> | null {
  const hit = matchCnG318HotspotBooking(message);
  if (!hit) return null;
  return {
    hotspot_id: hit.id,
    name_cn: hit.nameCN,
    hub_city_cn: hit.hubCityCN,
    corridor: hit.corridor,
    consult_blurb_cn: hit.consultBlurbCN,
    advance_booking_days_hint: hit.booking?.advanceBookingDaysHint,
    must_hints_cn: hit.booking?.mustHintsCN ?? [],
    disclaimer: cnG318HotspotBookingDisclaimer(),
  };
}
