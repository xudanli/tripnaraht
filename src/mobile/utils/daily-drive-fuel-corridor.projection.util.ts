/**
 * Daily Drive FUEL — Place 油站投影到行程自驾走廊（只读，不写库）。
 */

import { haversineKm } from '../../trips/attraction-explore/utils/attraction-explore-place-coordinates.util';
import type { TripPlan } from '../../trips/decision/plan-model';
import type { GeoPoint } from '../../trips/decision/world-model';
import {
  buildDriveCorridorSegments,
  corridorTotalKm,
} from '../../trips/fuel/project-fuel-poi-onto-corridor';
import type { IcelandFuelStationAlongRoute } from '../../decision-runtime/packs/knowledge/fuel/iceland-fuel.types';
import type { IcelandFuelStationProfile } from '../../decision-runtime/packs/knowledge/fuel/iceland-fuel.types';
import {
  buildStationsAheadFromCorridorArcs,
  buildStationsAheadFromPlanGeometry,
} from '../../decision-runtime/packs/knowledge/fuel/place-fuel-geometry.util';
import type { DailyDriveFuelStationRow } from '../dto/mobile-daily-drive.types';

/** 冰岛自驾均速（用于时长展示；走廊距离仍用 distanceKm） */
const AVG_DRIVE_KMH = 80;
/** 直线 → 路网粗估 */
const ROAD_FACTOR = 1.25;

export type CorridorDayWaypoints = {
  date: string;
  points: GeoPoint[];
};

export type FuelCorridorProjection = {
  stations: DailyDriveFuelStationRow[];
  nextStationKm?: number;
  todayRemainingKm?: number;
  tomorrowMorningKm?: number;
  placeStationCount: number;
  corridorKm: number;
};

function formatFuelDurationZh(totalMin: number): string {
  if (totalMin < 60) return `${Math.max(1, totalMin)} 分钟`;
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m > 0 ? `${h} 小时 ${m} 分钟` : `${h} 小时`;
}

function tagForIndex(i: number): {
  tag: DailyDriveFuelStationRow['tag'];
  tagZh: string;
} {
  if (i === 0) return { tag: 'RECOMMENDED', tagZh: '推荐' };
  if (i === 1) return { tag: 'RELIABLE', tagZh: '可靠' };
  return { tag: 'ALTERNATE', tagZh: '备选' };
}

/** 连续途经点 → 轻量 TripPlan（仅 drive legs，供走廊投影） */
export function buildLightTripPlanFromWaypoints(
  days: CorridorDayWaypoints[],
  tripId?: string,
): TripPlan | undefined {
  const planDays = days
    .map((d, dayIdx) => {
      const pts = d.points.filter(
        (p) => Number.isFinite(p.lat) && Number.isFinite(p.lng),
      );
      if (pts.length < 2) return null;
      const timeSlots = pts.map((p, i) => {
        const prev = i > 0 ? pts[i - 1]! : undefined;
        const distanceKm =
          prev != null
            ? Math.round(
                haversineKm(prev.lat, prev.lng, p.lat, p.lng) * ROAD_FACTOR * 10,
              ) / 10
            : 0;
        return {
          id: `dd-fuel-d${dayIdx}-s${i}`,
          time: '09:00' as const,
          title: `waypoint-${i}`,
          type: 'sightseeing' as const,
          coordinates: p,
          ...(prev && distanceKm > 0
            ? {
                travelLegFromPrev: {
                  mode: 'drive' as const,
                  from: prev,
                  to: p,
                  durationMin: Math.max(
                    1,
                    Math.round((distanceKm / AVG_DRIVE_KMH) * 60),
                  ),
                  distanceKm,
                  source: 'heuristic' as const,
                },
              }
            : {}),
        };
      });
      return {
        day: dayIdx + 1,
        date: d.date,
        timeSlots,
      };
    })
    .filter((d): d is NonNullable<typeof d> => d != null);

  if (planDays.length === 0) return undefined;
  return {
    version: 'daily-drive-fuel-corridor@v1',
    createdAt: new Date().toISOString(),
    tripId,
    days: planDays,
  };
}

export function dayDriveKmFromPlan(plan: TripPlan, date: string): number {
  const day = plan.days.find((d) => d.date === date);
  if (!day) return 0;
  let sum = 0;
  for (const slot of day.timeSlots) {
    const km = slot.travelLegFromPrev?.distanceKm;
    if (typeof km === 'number' && km > 0) sum += km;
  }
  return Math.round(sum);
}

/** 明日「早段」：取次日车程的前 40%，夹在 35–90 km */
export function estimateTomorrowMorningKm(tomorrowDriveKm: number): number {
  if (tomorrowDriveKm <= 0) return 0;
  const portion = Math.round(tomorrowDriveKm * 0.4);
  return Math.min(90, Math.max(35, portion || tomorrowDriveKm));
}

export function mapCorridorStationsToFuelRows(
  ahead: IcelandFuelStationAlongRoute[],
  max = 3,
): DailyDriveFuelStationRow[] {
  return ahead.slice(0, max).map((s, i) => {
    const { tag, tagZh } = tagForIndex(i);
    const distanceKm = Math.round(s.distanceKm);
    const durationMin = Math.max(
      1,
      Math.round((distanceKm / AVG_DRIVE_KMH) * 60),
    );
    const durationZh = formatFuelDurationZh(durationMin);
    const nameZh = s.profile.name?.trim() || s.profile.poiId;
    const detailZh = `${distanceKm} km · ${durationZh}`;
    return {
      id: s.profile.poiId,
      nameZh,
      tag,
      tagZh,
      distanceKm,
      durationZh,
      detailZh,
      lat: s.profile.lat,
      lng: s.profile.lng,
    };
  });
}

function mergeProfiles(
  pack: IcelandFuelStationProfile[],
  place: IcelandFuelStationProfile[],
): IcelandFuelStationProfile[] {
  const byId = new Map<string, IcelandFuelStationProfile>();
  for (const s of pack) byId.set(s.poiId, s);
  for (const s of place) byId.set(s.poiId, s);
  return [...byId.values()];
}

/**
 * Place（优先）+ pack seed 投影到走廊；无走廊时退化为终点附近几何排序。
 */
export function projectFuelStationsOntoTripCorridor(opts: {
  plan: TripPlan;
  placeStations: IcelandFuelStationProfile[];
  packStations?: IcelandFuelStationProfile[];
  /** 当前沿走廊累计位置；默认 0 = 今日走廊起点 */
  cumulativeKm?: number;
  maxStations?: number;
}): FuelCorridorProjection {
  const placeStationCount = opts.placeStations.length;
  const profiles = mergeProfiles(opts.packStations ?? [], opts.placeStations);
  const segments = buildDriveCorridorSegments(opts.plan);
  const corridorKm = corridorTotalKm(segments);
  const cumulativeKm = opts.cumulativeKm ?? 0;
  const maxStations = opts.maxStations ?? 3;

  let ahead =
    profiles.length > 0
      ? buildStationsAheadFromCorridorArcs({
          plan: opts.plan,
          profiles,
          cumulativeKm,
          maxStations: Math.max(8, maxStations),
        })
      : [];

  if (ahead.length === 0 && profiles.length > 0) {
    ahead = buildStationsAheadFromPlanGeometry({
      plan: opts.plan,
      profiles,
      maxStations: Math.max(8, maxStations),
    });
  }

  const stations = mapCorridorStationsToFuelRows(ahead, maxStations);
  const todayDate = opts.plan.days[0]?.date;
  const tomorrowDate = opts.plan.days[1]?.date;
  const todayRemainingKm = todayDate
    ? dayDriveKmFromPlan(opts.plan, todayDate)
    : undefined;
  const tomorrowDrive = tomorrowDate
    ? dayDriveKmFromPlan(opts.plan, tomorrowDate)
    : 0;
  const tomorrowMorningKm =
    tomorrowDrive > 0 ? estimateTomorrowMorningKm(tomorrowDrive) : undefined;

  return {
    stations,
    nextStationKm: stations[0]?.distanceKm,
    todayRemainingKm: todayRemainingKm && todayRemainingKm > 0 ? todayRemainingKm : undefined,
    tomorrowMorningKm,
    placeStationCount,
    corridorKm,
  };
}
