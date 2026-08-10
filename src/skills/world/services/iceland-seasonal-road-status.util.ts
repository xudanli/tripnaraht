/**
 * Seasonal F-road open-month corpus (physical-reality pack).
 * Used when live Gagnaveita is unavailable — not a substitute for Vegagerðin.
 */

import { existsSync, readFileSync } from 'fs';
import { join } from 'path';

export interface IcelandSeasonalRoadInfo {
  roadId: string;
  roadName?: string;
  roadNameEN?: string;
  openMonths: number[];
  typicalOpenPeriod?: string;
  vehicleTypeRequired?: string;
  hasRiverCrossing: boolean;
}

interface CorpusFile {
  roads?: Array<{
    roadId?: string;
    roadName?: string;
    roadNameEN?: string;
    season?: { openMonths?: number[]; openPeriod?: string };
    requirements?: { vehicleType?: string };
    hazards?: Array<{ type?: string }>;
  }>;
}

let cached: Map<string, IcelandSeasonalRoadInfo> | null = null;

function corpusPath(): string {
  return join(
    process.cwd(),
    'data/physical-reality/road-status/iceland-road-status.json',
  );
}

export function loadIcelandSeasonalRoadCorpus(): Map<string, IcelandSeasonalRoadInfo> {
  if (cached) return cached;
  const map = new Map<string, IcelandSeasonalRoadInfo>();
  const path = corpusPath();
  if (!existsSync(path)) {
    cached = map;
    return map;
  }
  try {
    const raw = JSON.parse(readFileSync(path, 'utf8')) as CorpusFile;
    for (const road of raw.roads ?? []) {
      const roadId = String(road.roadId ?? '')
        .trim()
        .toUpperCase();
      if (!roadId) continue;
      const openMonths = (road.season?.openMonths ?? [])
        .map((m) => Number(m))
        .filter((m) => Number.isFinite(m) && m >= 1 && m <= 12);
      map.set(roadId, {
        roadId,
        roadName: road.roadName,
        roadNameEN: road.roadNameEN,
        openMonths: openMonths.length > 0 ? openMonths : [6, 7, 8, 9],
        typicalOpenPeriod: road.season?.openPeriod,
        vehicleTypeRequired: road.requirements?.vehicleType,
        hasRiverCrossing: (road.hazards ?? []).some((h) => h.type === 'river_crossing'),
      });
    }
  } catch {
    // keep empty map
  }
  cached = map;
  return map;
}

/** Reset memo (tests). */
export function clearIcelandSeasonalRoadCorpusCache(): void {
  cached = null;
}

export function getIcelandSeasonalRoadInfo(
  roadId: string,
): IcelandSeasonalRoadInfo | undefined {
  return loadIcelandSeasonalRoadCorpus().get(roadId.trim().toUpperCase());
}

const MONTH_EN = [
  '',
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
] as const;

/** Prefer English open window derived from openMonths (corpus openPeriod may be zh). */
export function formatIcelandSeasonalOpenPeriod(openMonths: number[]): string {
  if (openMonths.length === 0) return 'Jun-Sep';
  const labels = openMonths
    .slice()
    .sort((a, b) => a - b)
    .map((m) => MONTH_EN[m] ?? String(m));
  if (labels.length === 1) return labels[0]!;
  return `${labels[0]}-${labels[labels.length - 1]}`;
}

/**
 * Seasonal status for highland F-roads:
 * - month in openMonths → limited (unverified open window)
 * - otherwise → closed
 */
export function resolveIcelandSeasonalRoadStatus(
  roadId: string,
  month: number = new Date().getMonth() + 1,
): 'limited' | 'closed' {
  const info = getIcelandSeasonalRoadInfo(roadId);
  const openMonths = info?.openMonths ?? [6, 7, 8, 9];
  return openMonths.includes(month) ? 'limited' : 'closed';
}
