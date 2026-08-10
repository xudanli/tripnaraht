/**
 * 中国城市限行提示（静态骨架，非实时交规）
 */
import * as fs from 'fs';
import * as path from 'path';

export type CnCityDrivingLimit = {
  cityCN: string;
  cityEN: string;
  regionCode?: string;
  limitType: string;
  severity: 'low' | 'medium' | 'high';
  summaryCN: string;
  summaryEN: string;
  appliesTo?: string[];
  peakHint?: string;
  officialHintUrl?: string;
};

type FileShape = {
  metadata?: { disclaimer?: string };
  cities: CnCityDrivingLimit[];
};

let cached: FileShape | null = null;

function loadFile(): FileShape {
  if (cached) return cached;
  const filePath = path.join(
    process.cwd(),
    'data/country-packs/CN/city-driving-limits.v1.json',
  );
  if (!fs.existsSync(filePath)) {
    cached = { cities: [] };
    return cached;
  }
  cached = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as FileShape;
  return cached;
}

/** 按中文/英文城市名查找限行提示（精确匹配，大小写不敏感英文） */
export function lookupCnCityDrivingLimit(
  cityName: string | null | undefined,
): CnCityDrivingLimit | null {
  const q = String(cityName || '').trim();
  if (!q) return null;
  const { cities } = loadFile();
  const lower = q.toLowerCase();
  return (
    cities.find(
      (c) => c.cityCN === q || c.cityEN.toLowerCase() === lower || c.cityCN.includes(q),
    ) || null
  );
}

export function listCnCityDrivingLimits(): CnCityDrivingLimit[] {
  return loadFile().cities.slice();
}

export function cnCityDrivingLimitDisclaimer(): string {
  return (
    loadFile().metadata?.disclaimer ||
    '限行政策高频变更；以当地交管部门当日通告为准。'
  );
}
