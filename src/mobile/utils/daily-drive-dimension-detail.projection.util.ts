/**
 * 今日自驾 — 五维详情页投影（P0 下钻，不替代 status）
 */

import {
  DAILY_DRIVE_DIMENSION_LABELS,
  DAILY_DRIVE_DIMENSION_SCHEMA_IDS,
  FUEL_LEVEL_LABELS_ZH,
  type DailyDriveConfirmPayload,
  type DailyDriveDaylightDetailDto,
  type DailyDriveDetailSeverity,
  type DailyDriveDimensionCode,
  type DailyDriveDimensionDetailDto,
  type DailyDriveDimensionStatus,
  type DailyDriveFuelDetailDto,
  type DailyDriveFuelLevel,
  type DailyDriveFuelStationRow,
  type DailyDriveRoadDetailDto,
  type DailyDriveScheduleDetailDto,
  type DailyDriveWeatherDetailDto,
} from '../dto/mobile-daily-drive.types';
import { projectScheduleDetailRich } from './daily-drive-schedule-detail.projection.util';
import { projectRoadDetailRich } from './daily-drive-road-detail.projection.util';
import { projectDaylightDetailRich } from './daily-drive-daylight-detail.projection.util';
import { projectWeatherDetailRich } from './daily-drive-weather-detail.projection.util';

export interface DimensionDetailContext {
  localDate: string;
  timezone: string;
  tripLabelZh: string;
  dayLabelZh: string;
  contextVersion?: number;
  summaryStatus: DailyDriveDimensionStatus;
  summaryDetailZh: string;
}

export function mapStatusToDetailSeverity(
  status: DailyDriveDimensionStatus,
): DailyDriveDetailSeverity {
  if (status === 'BLOCKED') return 'BLOCKED';
  if (status === 'ATTENTION') return 'ATTENTION';
  return 'OK';
}

function shellBase(
  code: DailyDriveDimensionCode,
  ctx: DimensionDetailContext,
  hero: {
    titleZh: string;
    detailZh: string;
    metaZh?: string;
    severity: DailyDriveDetailSeverity;
    iconHint?: string;
  },
  primaryAction?: DailyDriveDimensionDetailDto['primaryAction'],
) {
  return {
    schemaId: DAILY_DRIVE_DIMENSION_SCHEMA_IDS[code],
    localDate: ctx.localDate,
    timezone: ctx.timezone,
    contextVersion: ctx.contextVersion,
    context: {
      tripLabelZh: ctx.tripLabelZh,
      dayLabelZh: ctx.dayLabelZh,
    },
    hero,
    primaryAction,
  };
}

export function fuelLevelToFraction(level?: DailyDriveFuelLevel): number {
  switch (level) {
    case 'FULL':
      return 1;
    case 'THREE_QUARTERS':
      return 0.75;
    case 'HALF':
      return 0.5;
    case 'QUARTER':
      return 0.25;
    default:
      return 0.75;
  }
}

/** 满箱标称续航（与设计稿 3/4 → 420 km 对齐：0.75 × 560） */
const FUEL_FULL_RANGE_KM = 560;

function coverageStatus(
  ok: boolean,
  tight: boolean,
): { status: 'OK' | 'ATTENTION' | 'BLOCKED'; statusZh: string } {
  if (!ok) return { status: 'BLOCKED', statusZh: '不足' };
  if (tight) return { status: 'ATTENTION', statusZh: '紧张' };
  return { status: 'OK', statusZh: '足够' };
}

export function projectRoadDetail(
  ctx: DimensionDetailContext,
  input: {
    alertTitle?: string;
    alertDetail?: string;
    plowServiceBand?: string;
    plowDelayRangeMin?: [number, number];
    timeline?: Array<{ time: string; event: string; severity: string }>;
    routeNodesZh?: string[];
    routeSummaryZh?: string;
    items?: Array<{
      title: string;
      time?: string;
      endTime?: string;
      status?: string;
      travelFromPreviousKm?: number | null;
      travelFromPreviousMin?: number | null;
      lat?: number;
      lng?: number;
    }>;
    envEvents?: Array<{ description?: string; severity?: string }>;
    crosswind?: boolean;
    gravelKm?: number;
    nextChangeInMin?: number;
    arrivalWindowZh?: string;
    originLat?: number;
    originLng?: number;
    placeParking?: Array<{
      id: number;
      nameEN: string | null;
      nameCN: string | null;
      lat: number;
      lng: number;
      canonicalType: string;
    }>;
  },
): DailyDriveRoadDetailDto {
  return projectRoadDetailRich(ctx, {
    alertTitle: input.alertTitle,
    alertDetail: input.alertDetail,
    plowServiceBand: input.plowServiceBand,
    plowDelayRangeMin: input.plowDelayRangeMin,
    routeNodesZh: input.routeNodesZh,
    routeSummaryZh: input.routeSummaryZh,
    items: input.items,
    envEvents:
      input.envEvents ??
      input.timeline?.map((t) => ({
        description: t.event,
        severity: t.severity,
      })),
    crosswind: input.crosswind,
    gravelKm: input.gravelKm,
    nextChangeInMin: input.nextChangeInMin,
    arrivalWindowZh: input.arrivalWindowZh,
    originLat: input.originLat,
    originLng: input.originLng,
    placeParking: input.placeParking,
  });
}

export function projectWeatherDetail(
  ctx: DimensionDetailContext,
  input: {
    tempC?: number;
    windMsMin?: number;
    windMsMax?: number;
    summaryZh?: string;
    icy?: boolean;
    visibilityZh?: string;
    snowfallZh?: string;
    envEvents?: Array<{
      description?: string;
      severity?: string;
      detectedAt?: string;
      type?: string;
    }>;
  },
): DailyDriveWeatherDetailDto {
  return projectWeatherDetailRich(ctx, input);
}

export function projectDaylightDetail(
  ctx: DimensionDetailContext,
  input: {
    sunriseLabel?: string;
    sunsetLabel?: string;
    dawnLabel?: string;
    duskLabel?: string;
    sunriseMinutes?: number;
    sunsetMinutes?: number;
    dawnMinutes?: number;
    duskMinutes?: number;
    nightDriveLabelZh?: string;
    nightDriveMinutes?: number;
    attention?: boolean;
    itineraryItems?: Array<{
      time?: string;
      endTime?: string;
      title: string;
      status?: string;
      placeCategory?: string;
      note?: string | null;
    }>;
    nowMinutes?: number;
  },
): DailyDriveDaylightDetailDto {
  return projectDaylightDetailRich(ctx, {
    sunriseLabel: input.sunriseLabel,
    sunsetLabel: input.sunsetLabel,
    dawnLabel: input.dawnLabel,
    duskLabel: input.duskLabel,
    sunriseMinutes: input.sunriseMinutes,
    sunsetMinutes: input.sunsetMinutes,
    dawnMinutes: input.dawnMinutes,
    duskMinutes: input.duskMinutes,
    nightDriveMinutes: input.nightDriveMinutes,
    itineraryItems: input.itineraryItems,
    nowMinutes: input.nowMinutes,
  });
}

export function projectFuelDetail(
  ctx: DimensionDetailContext,
  input: {
    fuelLevel?: DailyDriveFuelLevel;
    nextStationKm?: number;
    confirmPayload?: DailyDriveConfirmPayload;
    todayRemainingKm?: number;
    tomorrowMorningKm?: number;
    /** Place/走廊实时投影结果；缺省为空列表 */
    stations?: DailyDriveFuelStationRow[];
  },
): DailyDriveFuelDetailDto {
  const level = input.fuelLevel ?? input.confirmPayload?.fuelLevel ?? 'THREE_QUARTERS';
  const fraction = fuelLevelToFraction(level);
  const rangeKm = Math.round(fraction * FUEL_FULL_RANGE_KM);
  const stations = input.stations ?? [];
  const nextStationKm =
    input.nextStationKm ?? stations[0]?.distanceKm ?? 92;
  const todayRemainingKm = input.todayRemainingKm ?? 134;
  const tomorrowMorningKm = input.tomorrowMorningKm ?? 58;
  const remoteNeedKm = todayRemainingKm + tomorrowMorningKm;
  const redundancy =
    remoteNeedKm > 0 ? Math.round((rangeKm / remoteNeedKm) * 10) / 10 : 2;

  const todayCov = coverageStatus(
    rangeKm >= todayRemainingKm,
    rangeKm < todayRemainingKm * 1.2,
  );
  const tomorrowCov = coverageStatus(
    rangeKm - todayRemainingKm >= tomorrowMorningKm,
    rangeKm - todayRemainingKm < tomorrowMorningKm * 1.3,
  );
  const remoteOk = redundancy >= 1.2;
  const remoteTight = redundancy < 1.5;
  const remoteStatus = !remoteOk
    ? { status: 'BLOCKED' as const, statusZh: '不足' }
    : remoteTight
      ? { status: 'ATTENTION' as const, statusZh: '紧张' }
      : { status: 'OK' as const, statusZh: '安全' };

  let severity: DailyDriveDetailSeverity = 'OK';
  if (todayCov.status === 'BLOCKED' || tomorrowCov.status === 'BLOCKED') {
    severity = 'BLOCKED';
  } else if (
    todayCov.status === 'ATTENTION' ||
    tomorrowCov.status === 'ATTENTION' ||
    remoteStatus.status === 'ATTENTION' ||
    level === 'QUARTER' ||
    level === 'HALF'
  ) {
    severity = 'ATTENTION';
  }

  const levelLabel = FUEL_LEVEL_LABELS_ZH[level];
  const heroTitle =
    severity === 'BLOCKED'
      ? '建议先补给再出发'
      : severity === 'ATTENTION'
        ? '当前油量可继续，建议顺路补给'
        : '当前油量可继续行驶';

  const recommended = stations[0];

  const ifNoRefuelRedundancy =
    tomorrowMorningKm > 0
      ? Math.round(((rangeKm - todayRemainingKm) / tomorrowMorningKm) * 10) / 10
      : redundancy;
  const ifNoRefuelZh =
    ifNoRefuelRedundancy < 1.2
      ? `今日行程仍可完成，但明早燃油冗余将降至约 ${Math.max(0.5, ifNoRefuelRedundancy).toFixed(1)}x，偏远路段安全性下降。`
      : ifNoRefuelRedundancy < 1.6
        ? `今日行程可完成；若不加油，明早冗余约 ${ifNoRefuelRedundancy.toFixed(1)}x，偏远段建议保持 ≥1.5x。`
        : `按当前油量，今日与明早行程覆盖充足（明早冗余约 ${ifNoRefuelRedundancy.toFixed(1)}x）；顺路补给可进一步抬高安全边际。`;
  const suggestionZh = recommended
    ? `在顺路的 ${recommended.nameZh} 加油后，明早安全冗余可提升至约 1.6x。`
    : '暂无走廊油站投影；请确认行程坐标或稍后重试，并及时更新油量。';

  return {
    ...shellBase(
      'FUEL',
      ctx,
      {
        titleZh: heroTitle,
        detailZh: `当前 ${levelLabel} · 预计还可行驶约 ${rangeKm} km`,
        metaZh: `下一可靠油站 ${nextStationKm} km`,
        severity,
        iconHint: 'fuelpump',
      },
      { labelZh: '更新油量', action: 'UPDATE_FUEL_LEVEL' },
    ),
    schemaId: DAILY_DRIVE_DIMENSION_SCHEMA_IDS.FUEL,
    fuelFraction: fraction,
    fuelLevelLabelZh: levelLabel,
    rangeKm,
    rangeLabelZh: `预计还可行驶约 ${rangeKm} km`,
    nextStationKm,
    nextStationLabelZh: `下一可靠油站 ${nextStationKm} km`,
    coverage: [
      {
        id: 'TODAY_REMAINING',
        labelZh: '今日剩余车程',
        valueZh: `${todayRemainingKm} km`,
        statusZh: todayCov.statusZh,
        status: todayCov.status,
      },
      {
        id: 'TOMORROW_MORNING',
        labelZh: '明日早段车程',
        valueZh: `${tomorrowMorningKm} km`,
        statusZh: tomorrowCov.statusZh,
        status: tomorrowCov.status,
      },
      {
        id: 'REMOTE_REDUNDANCY',
        labelZh: '偏远路段冗余',
        valueZh: `${redundancy}x`,
        statusZh: remoteStatus.statusZh,
        status: remoteStatus.status,
      },
    ],
    stations,
    ifNoRefuelZh,
    suggestionZh,
    selectedFuelLevel: level,
  };
}

export function projectScheduleDetail(
  ctx: DimensionDetailContext,
  input: {
    items?: Array<{
      time?: string;
      endTime?: string;
      title: string;
      status?: string;
      impactNote?: string;
      itemType?: string;
      placeCategory?: string;
      bookingStatus?: string | null;
      travelFromPreviousMin?: number | null;
      note?: string | null;
    }>;
    naraSuggestionZh?: string;
    nextHardWindowZh?: string;
    checkInZh?: string;
    nowMinutes?: number;
    daylightAttention?: boolean;
    delayMin?: number;
    delayMax?: number;
  },
): DailyDriveScheduleDetailDto {
  return projectScheduleDetailRich(ctx, {
    items: input.items,
    naraSuggestionZh: input.naraSuggestionZh,
    nowMinutes: input.nowMinutes,
    daylightAttention: input.daylightAttention,
    delayMin: input.delayMin,
    delayMax: input.delayMax,
  });
}

export function isDailyDriveDimensionCode(value: string): value is DailyDriveDimensionCode {
  return (Object.keys(DAILY_DRIVE_DIMENSION_LABELS) as string[]).includes(value);
}
