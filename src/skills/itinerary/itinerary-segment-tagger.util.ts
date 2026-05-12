/**
 * 路段标记器（Segment Tagger）— 后处理
 *
 * 在 `itinerary.generate` 产出 **仅含 POI 链** 的草案后，于相邻 POI 之间插入 `DRIVE` 项并写入
 * `metadata.route_segment_ref`，与 `REGIONS_TO_SEGMENTS` / `inferAffectedRouteSegmentRefsFromSafetravelText`
 * 中的 ref **字符串完全一致**，供 `itinerary.verify` + SafeTravel 对齐。
 *
 * 不做 GIS：仅基于 `place_id` + `name` 的规范化子串匹配（与 RSS 侧 normalize 策略一致）。
 */

import type { ItineraryDay, ItineraryItem } from '../../agent/interfaces/trip-plan.interface';

export function normalizeForRouteTagging(s: string | undefined | null): string {
  return String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function poiBlob(it: ItineraryItem): string {
  const id = it.location_ref?.place_id != null ? String(it.location_ref.place_id) : '';
  const name = it.location_ref?.name != null ? String(it.location_ref.name) : '';
  return normalizeForRouteTagging(`${id} ${name}`);
}

const hasVik = (b: string) => /\bvik\b/.test(b);
const hasJok = (b: string) => /jokulsarlon|glacier lagoon/.test(b);
const hasHofn = (b: string) => /\bhofn\b|hornafjordur/.test(b);
const hasAkureyri = (b: string) => /akureyri/.test(b);
const hasMyvatn = (b: string) => /myvatn|mývatn|lake myvatn/i.test(b);
const hasSelfoss = (b: string) => /\bselfoss\b/.test(b);
const hasCapital = (b: string) => /reykjavik|keflavik/.test(b);

/** 对称走廊：任一端点 blob 满足「锚点 A」、另一端满足「锚点 B」 */
const CORRIDORS: ReadonlyArray<{ ref: string; ok: (a: string, b: string) => boolean }> = [
  {
    ref: 'ring-road:vik-jokulsarlon',
    ok: (a, b) =>
      (hasVik(a) && hasJok(b) && !hasJok(a) && !hasVik(b)) || (hasVik(b) && hasJok(a) && !hasJok(b) && !hasVik(a)),
  },
  {
    ref: 'ring-road:jokulsarlon-hofn',
    ok: (a, b) =>
      (hasJok(a) && hasHofn(b) && !hasHofn(a) && !hasJok(b)) || (hasJok(b) && hasHofn(a) && !hasHofn(b) && !hasJok(a)),
  },
  {
    ref: 'ring-road:north-myvatn-corridor',
    ok: (a, b) =>
      (hasAkureyri(a) && hasMyvatn(b) && !hasMyvatn(a) && !hasAkureyri(b)) ||
      (hasAkureyri(b) && hasMyvatn(a) && !hasMyvatn(b) && !hasAkureyri(a)),
  },
  {
    ref: 'ring-road:selfoss-vik',
    ok: (a, b) =>
      (hasSelfoss(a) && hasVik(b) && !hasVik(a) && !hasSelfoss(b)) ||
      (hasSelfoss(b) && hasVik(a) && !hasVik(b) && !hasSelfoss(a)),
  },
  {
    ref: 'ring-road:capital-selfoss',
    ok: (a, b) =>
      (hasCapital(a) && hasSelfoss(b) && !hasSelfoss(a) && !hasCapital(b)) ||
      (hasCapital(b) && hasSelfoss(a) && !hasSelfoss(b) && !hasCapital(a)),
  },
];

function resolveCorridorRef(blobA: string, blobB: string): string | undefined {
  for (const c of CORRIDORS) {
    if (c.ok(blobA, blobB)) return c.ref;
  }
  return undefined;
}

function makeDriveLeg(
  requestId: string,
  dayDate: string,
  index: number,
  prev: ItineraryItem,
  next: ItineraryItem,
  ref: string,
): ItineraryItem {
  const pn = prev.location_ref?.name ?? 'A';
  const nn = next.location_ref?.name ?? 'B';
  return {
    id: `${requestId}_${dayDate}_corridor_drive_${index}`,
    type: 'DRIVE',
    start_window: prev.end_window,
    end_window: next.start_window,
    location_ref: {
      place_id: `drive:${ref.replace(/^ring-road:/, '')}`,
      name: `${pn} → ${nn}`,
    },
    evidence_refs: [],
    verified: false,
    verification_status: 'ASSUMPTION',
    metadata: {
      route_segment_ref: ref,
      segment_tagger: 'corridor_v1',
    },
  };
}

/**
 * 在单日 `items` 中，于相邻 POI 对之间插入带 `route_segment_ref` 的 `DRIVE`（原地组装新数组）。
 */
export function injectCorridorDriveLegsIntoDayItems(
  items: ItineraryItem[],
  requestId: string,
  dayDate: string,
): ItineraryItem[] {
  if (!Array.isArray(items) || items.length < 2) return items;

  const out: ItineraryItem[] = [];
  let driveIdx = 0;
  for (let i = 0; i < items.length; i++) {
    out.push(items[i]);
    const cur = items[i];
    const nxt = items[i + 1];
    if (!nxt) break;
    if (cur.type === 'POI' && nxt.type === 'POI') {
      const a = poiBlob(cur);
      const b = poiBlob(nxt);
      const ref = resolveCorridorRef(a, b);
      if (ref) {
        out.push(makeDriveLeg(requestId, dayDate, driveIdx++, cur, nxt, ref));
      }
    }
  }
  return out;
}

/**
 * 对多日行程每一日运行 {@link injectCorridorDriveLegsIntoDayItems}（浅拷贝 day，深拷贝 items 引用链上替换数组）。
 */
export function injectCorridorDriveLegsIntoDays(days: ItineraryDay[], requestId: string): ItineraryDay[] {
  if (!Array.isArray(days)) return days;
  return days.map((d) => ({
    ...d,
    items: injectCorridorDriveLegsIntoDayItems(d.items ?? [], requestId, d.date),
  }));
}
