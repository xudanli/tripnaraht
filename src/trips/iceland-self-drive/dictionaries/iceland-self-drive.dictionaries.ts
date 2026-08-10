import type {
  IcelandSelfDriveLocationCode,
  IcelandSelfDriveRegionId,
} from '../dto/iceland-self-drive-enums';

export const LOCATION_LABELS_ZH: Record<IcelandSelfDriveLocationCode, string> = {
  keflavik: '凯夫拉维克国际机场 KEF',
  reykjavik: '雷克雅未克市中心',
  akureyri: '阿库雷里',
};

export const LOCATION_SHORT_ZH: Record<IcelandSelfDriveLocationCode, string> = {
  keflavik: '凯夫拉维克',
  reykjavik: '雷克雅未克',
  akureyri: '阿库雷里',
};

export const LOCATION_PICKUP_CODES: Record<IcelandSelfDriveLocationCode, string> = {
  keflavik: 'KEF',
  reykjavik: 'REY',
  akureyri: 'AEY',
};

export const REGION_LABELS_ZH: Record<IcelandSelfDriveRegionId, string> = {
  golden_circle: '黄金圈',
  south_coast: '南岸',
  snaefellsnes: '斯奈山',
  east_fjords: '东峡湾',
  north: '北岸',
  ring_road: '环岛',
  westfjords: '西峡湾',
  highlands: '高地',
  reykjanes: '雷克雅内斯',
};

/** Map product region ids → exploration template region tokens */
export const REGION_ID_TO_TEMPLATE: Record<IcelandSelfDriveRegionId, string> = {
  golden_circle: 'GOLDEN_CIRCLE',
  south_coast: 'SOUTH_COAST',
  snaefellsnes: 'SNAEFELLSNES',
  east_fjords: 'EAST_FJORDS',
  north: 'NORTH_ICELAND',
  ring_road: 'RING_ROAD',
  westfjords: 'WESTFJORDS',
  highlands: 'HIGHLANDS',
  reykjanes: 'REYKJANES',
};

/** ISD regionId → Place.metadata.regionKey（与规划 POI 同源） */
export const REGION_ID_TO_PLACE_REGION_KEY: Record<
  IcelandSelfDriveRegionId,
  string | null
> = {
  golden_circle: 'IS_GOLDEN_CIRCLE',
  south_coast: 'IS_SOUTH_COAST',
  snaefellsnes: 'IS_SNAEFELLSNES',
  east_fjords: 'IS_EAST',
  north: 'IS_NORTH',
  /** 环岛跨多区，目录侧不单键过滤 */
  ring_road: null,
  westfjords: 'IS_WESTFJORDS',
  highlands: 'IS_HIGHLANDS',
  reykjanes: 'IS_REYKJANES',
};

export function placeRegionKeyToRegionId(
  regionKey: string | null | undefined,
): IcelandSelfDriveRegionId | null {
  if (!regionKey) return null;
  const u = regionKey.trim().toUpperCase();
  for (const [id, key] of Object.entries(REGION_ID_TO_PLACE_REGION_KEY)) {
    if (key && key === u) return id as IcelandSelfDriveRegionId;
  }
  // 宽松别名
  if (u.includes('SOUTH')) return 'south_coast';
  if (u.includes('GOLDEN')) return 'golden_circle';
  if (u.includes('WESTFJORD')) return 'westfjords';
  if (u.includes('HIGHLAND')) return 'highlands';
  if (u.includes('NORTH')) return 'north';
  if (u.includes('EAST')) return 'east_fjords';
  if (u.includes('SNAEFELL')) return 'snaefellsnes';
  if (u.includes('REYKJANES') || u.includes('REYKJAVIK')) return 'reykjanes';
  return null;
}

export function formatRegionSummary(regionIds: IcelandSelfDriveRegionId[]): string {
  if (regionIds.length === 0) return '冰岛自驾（待细化区域）';
  return regionIds.map((id) => REGION_LABELS_ZH[id]).join(' + ');
}

export function formatTransferLabel(
  start: IcelandSelfDriveLocationCode,
  end: IcelandSelfDriveLocationCode,
  endSameAsStart: boolean,
): string {
  if (endSameAsStart || start === end) {
    return `${LOCATION_SHORT_ZH[start]}往返`;
  }
  return `${LOCATION_SHORT_ZH[start]} → ${LOCATION_SHORT_ZH[end]}`;
}

export function formatDateRangeLabel(startDate: string, endDate: string): string {
  const s = parseYmd(startDate);
  const e = parseYmd(endDate);
  if (!s || !e) return `${startDate} - ${endDate}`;
  return `${s.month}月${s.day}日 - ${e.month}月${e.day}日`;
}

export function formatDurationLabel(startDate: string, endDate: string): string {
  const days = countInclusiveDays(startDate, endDate);
  if (days <= 0) return '行程';
  const nights = Math.max(0, days - 1);
  return `${days}天${nights}晚`;
}

export function countInclusiveDays(startDate: string, endDate: string): number {
  const s = Date.parse(`${startDate}T00:00:00Z`);
  const e = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(s) || Number.isNaN(e) || e < s) return 0;
  return Math.floor((e - s) / 86_400_000) + 1;
}

function parseYmd(ymd: string): { month: number; day: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(ymd);
  if (!m) return null;
  return { month: Number(m[2]), day: Number(m[3]) };
}
