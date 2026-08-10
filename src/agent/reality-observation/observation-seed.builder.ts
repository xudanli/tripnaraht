/**
 * ROR 种子/取数宿主：从已有行程摘要与 CRE target 组装初始事实。
 * P0 不直连全部外部 API；提供可注入的 fetch 适配点。
 */

import type { ContextRequirementPlan } from '../context-requirement/context-requirement.types';
import type {
  ObservationCapability,
  ObservationScope,
  RorFetchHost,
  RorSeedFacts,
} from './reality-observation.types';
import {
  hasFetchableRouteCoords,
  type RorRouteLegInput,
} from './route-matrix-ror-loader';

export type TripDaySeedActivity = {
  id?: string;
  title?: string;
  durationMinutes?: number;
  kind?: string;
  lat?: number;
  lng?: number;
};

export type TripDaySeed = {
  dayIndex: number;
  date?: string;
  activities?: TripDaySeedActivity[];
  accommodation?: unknown;
  travelMode?: 'SELF_DRIVE' | 'OTHER';
  vehicle?: unknown;
  vehicleDriveType?: string;
  vehicleRentalRestriction?: unknown;
  remainingDays?: number;
  participants?: unknown;
  teamMemberCapability?: unknown;
  fixedBookings?: unknown;
  bookingAvailability?: unknown;
  /** 若 ItineraryItem 上有段间行驶时长，合计分钟 */
  travelMinutesHint?: number;
  /** 行程目的地原文（天气城市解析） */
  destinationHint?: string;
  weatherCityHint?: string;
  latitudeDeg?: number;
  longitudeDeg?: number;
  /** 段间坐标腿（有坐标时由 ROUTE loader 拉真时长，不预置 matrix 种子） */
  routeLegs?: RorRouteLegInput[];
  /** 已绑定 ExperienceDefinition 才有；未绑定不预置 */
  experienceProduct?: unknown;
  experiencePhysicalIntensity?: string | null;
};

/**
 * 从 CRE + 页面/消息范围构造基础种子（无 IO）。
 */
export function buildRorSeedFacts(input: {
  crePlan?: ContextRequirementPlan | null;
  scope: ObservationScope;
  tripDay?: TripDaySeed | null;
  extras?: Record<string, unknown>;
}): RorSeedFacts {
  const dayIndex =
    input.scope.dayIndex ?? input.crePlan?.target?.dayIndex ?? input.tripDay?.dayIndex ?? null;
  const byKey: Record<string, unknown> = { ...(input.extras ?? {}) };

  if (input.scope.tripId?.trim()) {
    byKey['trip.id'] = input.scope.tripId.trim();
  }
  if (dayIndex != null && dayIndex > 0) {
    byKey['targetDay.date'] = input.tripDay?.date ?? dayIndex;
    byKey['page.focusDay'] = dayIndex;
  }
  if (input.tripDay?.activities) {
    byKey['targetDay.activities'] = input.tripDay.activities;
  }
  if (input.tripDay?.accommodation != null) {
    byKey['targetDay.accommodation'] = input.tripDay.accommodation;
  }
  if (input.tripDay?.travelMode) {
    byKey['travelMode'] = input.tripDay.travelMode;
  }
  if (input.tripDay?.vehicle != null) {
    byKey['vehicle.profile'] = input.tripDay.vehicle;
  }
  if (input.tripDay?.vehicleDriveType) {
    byKey['vehicle.driveType'] = input.tripDay.vehicleDriveType;
  }
  if (input.tripDay?.vehicleRentalRestriction != null) {
    byKey['vehicle.rentalRestriction'] = input.tripDay.vehicleRentalRestriction;
  }
  if (input.tripDay?.participants != null) {
    byKey['participants'] = input.tripDay.participants;
  }
  if (input.tripDay?.teamMemberCapability != null) {
    byKey['team.memberCapability'] = input.tripDay.teamMemberCapability;
  } else if (input.tripDay?.participants != null) {
    byKey['team.memberCapability'] = input.tripDay.participants;
  }
  if (input.tripDay?.fixedBookings != null) {
    byKey['booking.fixedCommitments'] = input.tripDay.fixedBookings;
  }
  if (input.tripDay?.bookingAvailability != null) {
    byKey['booking.availability'] = input.tripDay.bookingAvailability;
  }
  if (input.tripDay?.remainingDays != null) {
    byKey['trip.remainingDays'] = input.tripDay.remainingDays;
  }
  if (input.tripDay?.destinationHint) {
    byKey['trip.destination'] = input.tripDay.destinationHint;
  }
  /** 仅已绑定体验写入；禁止把 hint 当成 resolved product */
  if (input.tripDay?.experienceProduct != null) {
    byKey['experience.product'] = input.tripDay.experienceProduct;
  }
  if (input.tripDay?.experiencePhysicalIntensity != null) {
    byKey['experience.physicalIntensity'] = input.tripDay.experiencePhysicalIntensity;
  }
  /**
   * 有可拉取坐标腿时不预置 matrix，留给 ROUTE/Google；
   * 否则用行程项行驶合计作 INTERNAL 种子。
   */
  const legs = input.tripDay?.routeLegs ?? [];
  const canFetchRoute = hasFetchableRouteCoords(legs);
  if (
    !canFetchRoute &&
    input.tripDay?.travelMinutesHint != null &&
    input.tripDay.travelMinutesHint > 0 &&
    byKey['route.travelTimeMatrix'] == null
  ) {
    byKey['route.travelTimeMatrix'] = {
      totalMinutes: input.tripDay.travelMinutesHint,
      provider: 'ITINERARY',
      legs: [],
    };
  }
  /** experienceHint 仅作线索，不视为已观察产品事实（仍 FETCHABLE） */

  return {
    byKey,
    planVersion: input.scope.planVersion ?? undefined,
  };
}

/**
 * 内存 FetchHost：优先读 seed；否则调可选 loader（Trip/Route/…）。
 */
export function createObservationFetchHost(deps: {
  seeds?: RorSeedFacts;
  loaders?: Partial<
    Record<
      ObservationCapability['serviceKey'],
      (contextKey: string, scope: ObservationScope) => Promise<unknown | null>
    >
  >;
  /** 种子/本地 loader 未命中时回退（例如编排注入的 Weather/Road/Route host） */
  fallback?: RorFetchHost;
}): RorFetchHost {
  return {
    async fetchByServiceKey(serviceKey, contextKey, scope) {
      const seeded = deps.seeds?.byKey?.[contextKey];
      if (seeded != null) return seeded;
      const loader = deps.loaders?.[serviceKey];
      if (loader) {
        try {
          const v = await loader(contextKey, scope);
          if (v != null) return v;
        } catch {
          /* fall through */
        }
      }
      if (deps.fallback?.fetchByServiceKey) {
        try {
          return await deps.fallback.fetchByServiceKey(serviceKey, contextKey, scope);
        } catch {
          return null;
        }
      }
      return null;
    },
  };
}

/**
 * 从轻量行程摘要文本启发式提取「第 N 天」活动行（弱信号，confidence 由执行器标 INTERNAL）。
 */
export function extractDayActivitiesFromTripSummaryText(
  summary: string,
  dayIndex: number,
): TripDaySeedActivity[] {
  if (!summary?.trim() || dayIndex < 1) return [];
  const lines = summary.split(/\r?\n/);
  const dayRe = new RegExp(`(?:第\\s*${dayIndex}\\s*天|Day\\s*${dayIndex}\\b)`, 'i');
  let capturing = false;
  const acts: TripDaySeedActivity[] = [];
  for (const line of lines) {
    if (dayRe.test(line)) {
      capturing = true;
      continue;
    }
    if (capturing && /(?:第\s*\d+\s*天|Day\s*\d+\b)/i.test(line)) {
      break;
    }
    if (!capturing) continue;
    const m = line.match(/^\s*[-•*]?\s*(.+?)(?:\s*[（(]?\s*(\d+)\s*分钟)?/);
    if (m && m[1] && m[1].trim().length >= 2) {
      acts.push({
        title: m[1].trim().slice(0, 80),
        durationMinutes: m[2] ? Number(m[2]) : 90,
      });
    }
  }
  return acts.slice(0, 12);
}
