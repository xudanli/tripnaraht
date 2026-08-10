import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomUUID } from 'crypto';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import type { EnvironmentEventSummary } from '../../trips/in-trip-execution/types/environment-event.types';
import { toInputJsonValue } from '../../trips/budget-os/utils/prisma-json.util';
import { DEFAULT_TRIP_DISPLAY_TIMEZONE } from '../../common/utils/format-clock-label.util';
import { resolveDaylightFact } from '../../trips/tep/utils/daylight-fact.provider';
import {
  ICELAND_DAYLIGHT_FALLBACK_LAT,
  ICELAND_DAYLIGHT_FALLBACK_LNG,
} from '../../decision-runtime/packs/knowledge/demo/enrich-iceland-route-facts-daylight';
import {
  computeMobileContextVersion,
  formatTimeHHmm,
  resolveDayNumber,
} from '../utils/mobile-execution.util';
import { TripContextChangeNotifierService } from '../ws/trip-context-change-notifier.service';
import { MobileExecutionService } from './mobile-execution.service';
import { MobileExecutionWriteService } from './mobile-execution-write.service';
import { applyConfirmToDriveSession } from '../utils/drive-session.projection.util';
import type { StoredDriveSession } from '../dto/mobile-overview-dashboard.types';
import {
  DAILY_DRIVE_CONFIRM_SCHEMA_ID,
  FATIGUE_LEVELS,
  FUEL_LEVELS,
  type DailyDriveConfirmDraftDto,
  type DailyDriveConfirmPayload,
  type DailyDriveConfirmSubmitResponseDto,
  type DailyDriveDimensionCode,
  type DailyDriveDimensionDetailDto,
  type DailyDriveDimensionStatus,
  type DailyDriveDriverOptionDto,
  type DailyDriveFatigue,
  type DailyDriveFuelLevel,
  type DailyDriveMetadata,
  type DailyDriveStatusDto,
  type DailyDriveStoredConfirmation,
} from '../dto/mobile-daily-drive.types';
import {
  defaultConfirmPayload,
  projectDailyDriveStatus,
} from '../utils/daily-drive-status.projection.util';
import {
  isDailyDriveDimensionCode,
  projectDaylightDetail,
  projectFuelDetail,
  projectRoadDetail,
  projectScheduleDetail,
  projectWeatherDetail,
  type DimensionDetailContext,
} from '../utils/daily-drive-dimension-detail.projection.util';
import {
  buildLightTripPlanFromWaypoints,
  projectFuelStationsOntoTripCorridor,
  type CorridorDayWaypoints,
} from '../utils/daily-drive-fuel-corridor.projection.util';
import {
  getCachedIcelandPlaceFuelStations,
  loadIcelandFuelStationsFromPlaceCached,
} from '../../decision-runtime/packs/knowledge/fuel/load-iceland-fuel-stations-from-place';
import { loadIcelandFuelStationProfiles } from '../../decision-runtime/packs/knowledge/fuel/iceland-fuel.loader';
import { loadIcelandParkingNearPoint } from '../../decision-runtime/packs/knowledge/road/load-iceland-parking-near.util';
import { Prisma } from '@prisma/client';

interface MobileMetaWithDailyDrive {
  dailyDrive?: DailyDriveMetadata;
  idempotencyKeys?: Record<string, string>;
  [key: string]: unknown;
}

type PlowLite = {
  plowServiceBand: 'DAILY' | 'REDUCED' | 'NOT_PLOWED' | 'UNKNOWN';
  plowDelayRangeMin?: [number, number];
};

type LightItineraryItem = {
  time?: string;
  endTime?: string;
  title: string;
  location?: string;
  status: string;
  impactNote?: string;
  itemType?: string;
  placeCategory?: string;
  bookingStatus?: string | null;
  travelFromPreviousMin?: number | null;
  travelFromPreviousKm?: number | null;
  note?: string | null;
  lat?: number;
  lng?: number;
};

/** 进程内短缓存：同 trip+日 重复打开压到数十 ms */
const statusCache = new Map<string, { expiresAt: number; value: DailyDriveStatusDto }>();
const STATUS_CACHE_TTL_MS = 20_000;
/** 五维详情短缓存 */
const dimensionCache = new Map<
  string,
  { expiresAt: number; value: DailyDriveDimensionDetailDto }
>();
const DIMENSION_CACHE_TTL_MS = 20_000;
/** alerts 预算：超时则降级为空 reminders，保证热路径 <500ms */
const ALERTS_BUDGET_MS = 120;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | null> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(null), ms);
    promise
      .then((v) => {
        clearTimeout(timer);
        resolve(v);
      })
      .catch(() => {
        clearTimeout(timer);
        resolve(null);
      });
  });
}

function invalidateDailyDriveStatusCache(tripId: string) {
  for (const key of statusCache.keys()) {
    if (key.startsWith(`${tripId}:`)) statusCache.delete(key);
  }
  for (const key of dimensionCache.keys()) {
    if (key.startsWith(`${tripId}:`)) dimensionCache.delete(key);
  }
}

@Injectable()
export class MobileDailyDriveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly mobileRead: MobileExecutionService,
    private readonly mobileWrite: MobileExecutionWriteService,
    private readonly contextNotifier: TripContextChangeNotifierService,
  ) {}

  async getStatus(
    tripId: string,
    userId: string,
    opts?: { localDate?: string; includeReminders?: boolean },
  ): Promise<DailyDriveStatusDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const timezone = this.resolveTimezone(trip.metadata);
    const localDate = this.resolveLocalDate(timezone, opts?.localDate);
    const includeReminders = opts?.includeReminders !== false;
    const cacheKey = `${tripId}:${localDate}:${includeReminders ? 1 : 0}`;
    const hit = statusCache.get(cacheKey);
    if (hit && hit.expiresAt > Date.now()) {
      return hit.value;
    }
    const value = await this.buildStatus(tripId, userId, trip, timezone, localDate, {
      includeReminders,
    });
    statusCache.set(cacheKey, { expiresAt: Date.now() + STATUS_CACHE_TTL_MS, value });
    return value;
  }

  async getConfirmDraft(
    tripId: string,
    userId: string,
    opts?: { localDate?: string },
  ): Promise<DailyDriveConfirmDraftDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const timezone = this.resolveTimezone(trip.metadata);
    const localDate = this.resolveLocalDate(timezone, opts?.localDate);
    const [contextVersion, stored, drivers] = await Promise.all([
      this.resolveContextVersionLight(trip.updatedAt),
      this.loadStoredConfirmation(tripId, localDate),
      this.loadDriverOptions(tripId),
    ]);
    const primary =
      drivers.find((d) => d.isPrimaryDriver)?.memberId ??
      drivers[0]?.memberId ??
      userId;

    return {
      schemaId: DAILY_DRIVE_CONFIRM_SCHEMA_ID,
      localDate,
      timezone,
      isConfirmed: !!stored,
      lastSubmission: stored?.payload,
      defaults: stored?.payload ?? defaultConfirmPayload(primary),
      driverOptions: drivers,
      contextVersion,
    };
  }

  async getDimensionDetail(
    tripId: string,
    userId: string,
    codeRaw: string,
    opts?: { localDate?: string },
  ): Promise<DailyDriveDimensionDetailDto> {
    const code = codeRaw.trim().toUpperCase();
    if (!isDailyDriveDimensionCode(code)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'dimension code 必须是 ROAD | WEATHER | DAYLIGHT | FUEL | SCHEDULE',
      });
    }

    const trip = await this.access.assertTripMember(tripId, userId);
    const timezone = this.resolveTimezone(trip.metadata);
    const localDate = this.resolveLocalDate(timezone, opts?.localDate);
    const cacheKey = `${tripId}:${localDate}:${code}`;
    const cached = dimensionCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.value;
    }

    const dayNumber = resolveDayNumber(
      trip.startDate,
      trip.endDate,
      DateTime.fromISO(localDate, { zone: timezone }).isValid
        ? DateTime.fromISO(localDate, { zone: timezone })
        : DateTime.now().setZone(timezone),
    );

    const needItinerary =
      code === 'ROAD' || code === 'DAYLIGHT' || code === 'SCHEDULE';
    const needEnv = code === 'ROAD' || code === 'WEATHER' || code === 'SCHEDULE';
    const needStored = code === 'FUEL' || code === 'SCHEDULE';
    const needFuelCorridor = code === 'FUEL';
    const needDaylight = code === 'DAYLIGHT' || code === 'SCHEDULE';

    const itineraryItems = needItinerary
      ? await this.loadTodayItemsLight(
          tripId,
          trip.startDate,
          trip.endDate,
          localDate,
          timezone,
        )
      : ([] as LightItineraryItem[]);
    const origin =
      itineraryItems.find((i) => i.status === 'inProgress' && i.lat != null) ??
      itineraryItems.find((i) => i.lat != null);

    const [envEvents, fuelCorridor, placeParking] = await Promise.all([
      needEnv
        ? this.loadEnvEventsLight(tripId)
        : Promise.resolve([] as EnvironmentEventSummary[]),
      needFuelCorridor
        ? this.loadFuelCorridorProjection(
            tripId,
            trip.startDate,
            trip.endDate,
            localDate,
            timezone,
          )
        : Promise.resolve(undefined),
      code === 'ROAD' && origin?.lat != null && origin?.lng != null
        ? this.loadPlaceParkingNearSafe(origin.lat, origin.lng)
        : Promise.resolve(
            [] as Awaited<
              ReturnType<MobileDailyDriveService['loadPlaceParkingNearSafe']>
            >,
          ),
    ]);

    const stored = needStored
      ? this.readStoredConfirmation(trip.metadata, localDate)
      : undefined;

    const contextVersion = this.resolveContextVersionLight(trip.updatedAt);
    const topEnv = envEvents[0];
    const roadSummary = this.projectLightRoad(topEnv, undefined);
    const daylight = needDaylight
      ? this.resolveDaylight(localDate, timezone, {
          lat: origin?.lat,
          lng: origin?.lng,
        })
      : {
          sunriseLabel: '—',
          sunsetLabel: '—',
          dawnLabel: undefined as string | undefined,
          duskLabel: undefined as string | undefined,
          sunriseMinutes: undefined as number | undefined,
          sunsetMinutes: undefined as number | undefined,
          dawnMinutes: undefined as number | undefined,
          duskMinutes: undefined as number | undefined,
          nightDriveLabelZh: '',
          attention: false,
        };
    const schedule = this.resolveScheduleFromLight(itineraryItems);

    const dimStatus = this.resolveDimensionSummaryStatus(code as DailyDriveDimensionCode, {
      topEnv,
      roadSummary,
      daylight,
      schedule,
      fuelLevel: stored?.payload?.fuelLevel,
      nextStationKm:
        fuelCorridor?.nextStationKm ?? this.estimateNextFuelKm(trip.metadata),
      confirmPayload: stored?.payload,
    });
    const dimDetailZh = this.resolveDimensionSummaryDetailZh(code as DailyDriveDimensionCode, {
      topEnv,
      roadSummary,
      daylight,
      schedule,
      fuelLevel: stored?.payload?.fuelLevel,
      nextStationKm:
        fuelCorridor?.nextStationKm ?? this.estimateNextFuelKm(trip.metadata),
    });

    const ctx: DimensionDetailContext = {
      localDate,
      timezone,
      tripLabelZh: trip.name?.trim() || '行程',
      dayLabelZh: `第 ${dayNumber} 天`,
      contextVersion,
      summaryStatus: dimStatus,
      summaryDetailZh: dimDetailZh,
    };

    let result: DailyDriveDimensionDetailDto;
    switch (code as DailyDriveDimensionCode) {
      case 'ROAD': {
        const nodes = this.buildRouteNodesFromLight(itineraryItems);
        const gravelHint = /碎石|gravel|F\d{2,3}/i.test(
          `${roadSummary.alertDetail ?? ''} ${topEnv?.description ?? ''}`,
        );
        result = projectRoadDetail(ctx, {
          alertTitle: roadSummary.alertTitle,
          alertDetail: roadSummary.alertDetail,
          plowServiceBand: roadSummary.plowServiceBand,
          timeline: envEvents.map((ev) => ({
            time: formatTimeHHmm(ev.detectedAt),
            event: ev.description?.slice(0, 120) ?? ev.type,
            severity: ev.severity === 'red' ? 'high' : ev.severity === 'yellow' ? 'medium' : 'low',
          })),
          routeNodesZh: nodes,
          items: itineraryItems.map((i) => ({
            title: i.title,
            time: i.time,
            endTime: i.endTime,
            status: i.status,
            travelFromPreviousKm: i.travelFromPreviousKm,
            travelFromPreviousMin: i.travelFromPreviousMin,
            lat: i.lat,
            lng: i.lng,
          })),
          envEvents: envEvents.map((e) => ({
            description: e.description,
            severity: e.severity,
          })),
          gravelKm: gravelHint ? 8 : 0,
          originLat: origin?.lat,
          originLng: origin?.lng,
          placeParking,
        });
        break;
      }
      case 'WEATHER':
        result = projectWeatherDetail(ctx, {
          summaryZh: topEnv?.description?.slice(0, 80),
          icy: /冰|结冰|ice|湿滑/i.test(`${topEnv?.description ?? ''}`),
          envEvents: envEvents.map((e) => ({
            description: e.description,
            severity: e.severity,
            detectedAt: e.detectedAt,
          })),
        });
        break;
      case 'DAYLIGHT': {
        const now = DateTime.now().setZone(timezone);
        result = projectDaylightDetail(ctx, {
          ...daylight,
          nowMinutes: now.hour * 60 + now.minute,
          itineraryItems: itineraryItems.map((i) => ({
            time: i.time,
            endTime: i.endTime,
            title: i.title,
            status: i.status,
            placeCategory: i.placeCategory,
            note: i.note,
          })),
        });
        break;
      }
      case 'FUEL':
        result = projectFuelDetail(ctx, {
          fuelLevel: stored?.payload?.fuelLevel,
          nextStationKm:
            fuelCorridor?.nextStationKm ?? this.estimateNextFuelKm(trip.metadata),
          confirmPayload: stored?.payload,
          todayRemainingKm: fuelCorridor?.todayRemainingKm,
          tomorrowMorningKm: fuelCorridor?.tomorrowMorningKm,
          stations: fuelCorridor?.stations ?? [],
        });
        break;
      case 'SCHEDULE': {
        const delay = this.estimateScheduleDelayFromEnv(envEvents);
        const nowMinutes =
          DateTime.now().setZone(timezone).hour * 60 +
          DateTime.now().setZone(timezone).minute;
        result = projectScheduleDetail(ctx, {
          items: itineraryItems,
          nextHardWindowZh: schedule.nextHardWindowZh,
          checkInZh: schedule.checkInZh,
          nowMinutes,
          daylightAttention: daylight.attention,
          delayMin: delay.min,
          delayMax: delay.max,
        });
        break;
      }
      default:
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: '未知 dimension code',
        });
    }

    dimensionCache.set(cacheKey, {
      expiresAt: Date.now() + DIMENSION_CACHE_TTL_MS,
      value: result,
    });
    return result;
  }

  private resolveDimensionSummaryStatus(
    code: DailyDriveDimensionCode,
    input: {
      topEnv?: EnvironmentEventSummary;
      roadSummary: { severity?: string };
      daylight: { attention?: boolean };
      schedule: { attention?: boolean };
      fuelLevel?: DailyDriveFuelLevel;
      nextStationKm?: number;
      confirmPayload?: DailyDriveConfirmPayload;
    },
  ): DailyDriveDimensionStatus {
    switch (code) {
      case 'ROAD':
      case 'WEATHER':
        if (input.topEnv?.severity === 'red') return 'BLOCKED';
        if (input.topEnv?.severity === 'yellow') return 'ATTENTION';
        if (input.roadSummary.severity === 'high') return 'BLOCKED';
        if (input.roadSummary.severity === 'medium') return 'ATTENTION';
        return 'OK';
      case 'DAYLIGHT':
        return input.daylight.attention ? 'ATTENTION' : 'OK';
      case 'SCHEDULE': {
        let status: DailyDriveDimensionStatus = input.schedule.attention
          ? 'ATTENTION'
          : 'OK';
        const p = input.confirmPayload;
        if (p && (!p.prepCompleted || !p.departOnPlan || p.fatigue === 'FATIGUED')) {
          status = 'ATTENTION';
        }
        return status;
      }
      case 'FUEL': {
        if (input.fuelLevel === 'QUARTER') return 'ATTENTION';
        if (
          input.nextStationKm != null &&
          input.nextStationKm > 80 &&
          (input.fuelLevel === 'HALF' || input.fuelLevel == null)
        ) {
          return 'ATTENTION';
        }
        return 'OK';
      }
      default:
        return 'OK';
    }
  }

  private resolveDimensionSummaryDetailZh(
    code: DailyDriveDimensionCode,
    input: {
      topEnv?: EnvironmentEventSummary;
      roadSummary: { alertDetail?: string; alertTitle?: string };
      daylight: {
        sunriseLabel?: string;
        sunsetLabel?: string;
        nightDriveLabelZh?: string;
      };
      schedule: { nextHardWindowZh?: string; checkInZh?: string };
      fuelLevel?: DailyDriveFuelLevel;
      nextStationKm?: number;
    },
  ): string {
    switch (code) {
      case 'ROAD':
      case 'WEATHER':
        return (
          input.topEnv?.description?.slice(0, 120) ||
          input.roadSummary.alertDetail ||
          input.roadSummary.alertTitle ||
          '暂无显著影响'
        );
      case 'DAYLIGHT':
        return `日出 ${input.daylight.sunriseLabel ?? '—'} · 日落 ${input.daylight.sunsetLabel ?? '—'}\n${input.daylight.nightDriveLabelZh ?? ''}`.trim();
      case 'SCHEDULE':
        return `${input.schedule.nextHardWindowZh ?? ''}\n${input.schedule.checkInZh ?? ''}`.trim();
      case 'FUEL': {
        const level = input.fuelLevel ? `油量 ${input.fuelLevel}` : '油量待确认';
        const next =
          input.nextStationKm != null
            ? `下一油站约 ${Math.round(input.nextStationKm)} km`
            : '';
        return [level, next].filter(Boolean).join(' · ');
      }
      default:
        return '';
    }
  }

  private buildRouteNodesFromLight(items: LightItineraryItem[]): string[] {
    if (items.length === 0) return ['今日起点', '途经路段', '今日终点'];
    const nodes: string[] = [];
    if (items[0]) nodes.push(items[0].location || items[0].title);
    if (items.length > 2) {
      const mid = items[Math.floor(items.length / 2)];
      nodes.push(mid.location || mid.title);
    } else if (items.length === 2) {
      nodes.push('途经路段');
    }
    const last = items[items.length - 1];
    if (last) nodes.push(last.location || last.title);
    return nodes.length >= 2 ? nodes : ['今日起点', '途经路段', '今日终点'];
  }

  async submitConfirm(
    tripId: string,
    userId: string,
    body: Partial<DailyDriveConfirmPayload> & {
      localDate?: string;
      clientObservedAt?: string;
    },
    opts: { idempotencyKey?: string; ifMatch?: number },
  ): Promise<DailyDriveConfirmSubmitResponseDto> {
    if (!opts.idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 Idempotency-Key',
      });
    }
    if (opts.ifMatch == null || !Number.isFinite(opts.ifMatch)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: '写操作需要 If-Match: <contextVersion>',
      });
    }

    await this.mobileWrite.assertContextVersion(tripId, userId, opts.ifMatch);

    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);

    const timezone = this.resolveTimezone(trip.metadata);
    const todayLocal = this.resolveLocalDate(timezone);
    const localDate = body.localDate?.trim() || todayLocal;
    if (localDate !== todayLocal) {
      throw new BadRequestException({
        code: 'CONFIRM_EXPIRED',
        message: `提交的 localDate=${localDate} 已不是当地今日 ${todayLocal}`,
      });
    }

    const payload = this.validatePayload(body, tripId);

    const mobile = await this.loadMobileMeta(tripId);
    const dailyDrive: DailyDriveMetadata = {
      ...(mobile.dailyDrive ?? {}),
      byLocalDate: { ...(mobile.dailyDrive?.byLocalDate ?? {}) },
    };
    const existing = dailyDrive.byLocalDate?.[localDate];
    const idempotencyKeys =
      (mobile.idempotencyKeys as Record<string, string> | undefined) ?? {};

    const priorKeyTarget = idempotencyKeys[opts.idempotencyKey];
    if (priorKeyTarget) {
      const [priorDate, priorId] = priorKeyTarget.split('::');
      const prior =
        priorDate && priorId
          ? dailyDrive.byLocalDate?.[priorDate]
          : existing;
      if (prior && (!priorId || prior.confirmationId === priorId)) {
        // 幂等重放：轻量 status（不拉 alerts），避免二次重活
        const status = await this.buildStatus(
          tripId,
          userId,
          trip,
          timezone,
          priorDate || localDate,
          { includeReminders: false },
        );
        const contextVersion =
          status.contextVersion ?? this.resolveContextVersionLight(trip.updatedAt);
        return {
          confirmationId: prior.confirmationId,
          localDate: priorDate || localDate,
          isConfirmed: true,
          confirmedAt: prior.confirmedAt,
          contextVersion,
          replay: true,
          status: { ...status, contextVersion },
        };
      }
    }

    const memberIds = await this.loadMemberIds(tripId);
    if (!memberIds.has(payload.driverMemberId)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'driverMemberId 必须是本行程成员',
      });
    }

    const confirmedAt = new Date().toISOString();
    const confirmationId = existing?.confirmationId ?? randomUUID();
    const stored: DailyDriveStoredConfirmation = {
      confirmationId,
      confirmedAt,
      confirmedByMemberId: userId,
      payload,
      idempotencyResults: existing?.idempotencyResults,
    };

    dailyDrive.byLocalDate![localDate] = stored;
    mobile.dailyDrive = dailyDrive;
    mobile.idempotencyKeys = {
      ...idempotencyKeys,
      [opts.idempotencyKey]: `${localDate}::${confirmationId}`,
    };
    mobile.driveSession = applyConfirmToDriveSession({
      prev: (mobile.driveSession as StoredDriveSession | undefined) ?? null,
      localDate,
      confirmedAt,
      driverMemberId: payload.driverMemberId,
    });
    await this.saveMobileMeta(tripId, mobile);
    invalidateDailyDriveStatusCache(tripId);

    const refreshedTrip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    // 写后投影：不拉 alerts（客户端可再 GET status）；保证 FUEL 文案即时更新
    const status = await this.buildStatus(
      tripId,
      userId,
      refreshedTrip!,
      timezone,
      localDate,
      { includeReminders: false },
    );
    const contextVersion =
      status.contextVersion ?? this.resolveContextVersionLight(refreshedTrip!.updatedAt);

    this.contextNotifier.notifyTripContextChanged({
      tripId,
      contextVersion,
      changedSections: ['daily_drive', 'execution', 'overview_dashboard'],
    });

    return {
      confirmationId,
      localDate,
      isConfirmed: true,
      confirmedAt,
      contextVersion,
      replay: false,
      status: { ...status, contextVersion },
    };
  }

  private async buildStatus(
    tripId: string,
    userId: string,
    trip: { id: string; updatedAt: Date; metadata: unknown; startDate?: Date; endDate?: Date },
    timezone: string,
    localDate: string,
    opts: { includeReminders: boolean },
  ): Promise<DailyDriveStatusDto> {
    const stored = this.readStoredConfirmation(trip.metadata, localDate);

    const alertsPromise = opts.includeReminders
      ? withTimeout(
          this.mobileRead.getExecutionAlerts(tripId, userId).catch(() => null),
          ALERTS_BUDGET_MS,
        )
      : Promise.resolve(null);

    const [alerts, envEvents, itineraryItems] = await Promise.all([
      alertsPromise,
      this.loadEnvEventsLight(tripId),
      this.loadTodayItemsLight(tripId, trip.startDate, trip.endDate, localDate, timezone),
    ]);

    const remindersDeferred = opts.includeReminders && alerts == null;
    const contextVersion =
      alerts?.contextVersion ?? this.resolveContextVersionLight(trip.updatedAt);

    const topEnv = envEvents[0];
    const roadSummary = this.projectLightRoad(topEnv, undefined);
    const daylight = this.resolveDaylight(localDate, timezone);
    const schedule = this.resolveScheduleFromLight(itineraryItems);
    const suggested = this.resolveSuggestedDepartFromLight(itineraryItems, timezone, localDate);

    const fuelCorridor = await this.loadFuelCorridorProjection(
      tripId,
      trip.startDate,
      trip.endDate,
      localDate,
      timezone,
    ).catch(() => undefined);
    const corridorKm = fuelCorridor?.nextStationKm;
    const metaKm = this.estimateNextFuelKmFromMeta(trip.metadata);
    const nextStationKm = corridorKm ?? metaKm;

    const status = projectDailyDriveStatus({
      localDate,
      timezone,
      includeReminders: opts.includeReminders && !remindersDeferred,
      remindersDeferred,
      contextVersion,
      confirmation: stored
        ? {
            isConfirmed: true,
            confirmedAt: stored.confirmedAt,
            confirmedByMemberId: stored.confirmedByMemberId,
            payload: stored.payload,
          }
        : { isConfirmed: false },
      road: roadSummary,
      weather: {
        summaryZh: topEnv?.description?.slice(0, 80),
        icy: /冰|结冰|ice/i.test(`${roadSummary.alertDetail ?? ''} ${topEnv?.description ?? ''}`),
      },
      daylight,
      fuel: {
        nextStationKm,
        stationResolved: corridorKm != null,
      },
      schedule,
      suggestedDepartBeforeLabelZh: suggested.labelZh,
      suggestedDepartBeforeAt: suggested.at,
      alerts: alerts ?? undefined,
      naraSuggestionZh: alerts?.aiRecommendation?.detail,
      evidenceUpdatedAt: new Date().toISOString(),
    });

    return status;
  }

  /** 直查 env 表，跳过 assertInTripPhase / 全量 radar */
  private async loadEnvEventsLight(tripId: string): Promise<EnvironmentEventSummary[]> {
    const rows = await this.prisma.tripEnvironmentEvent.findMany({
      where: { tripId, status: { in: ['open', 'voting'] } },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
      take: 8,
      select: {
        id: true,
        tripId: true,
        type: true,
        severity: true,
        description: true,
        status: true,
        detectedAt: true,
        silentVoteId: true,
      },
    });
    return rows.map((row) => ({
      id: row.id,
      tripId: row.tripId,
      type: row.type as EnvironmentEventSummary['type'],
      severity: row.severity as EnvironmentEventSummary['severity'],
      description: row.description,
      status: row.status as EnvironmentEventSummary['status'],
      detectedAt: row.detectedAt.toISOString(),
      affectedItemCount: 0,
      alternativePlanCount: 0,
      silentVoteId: row.silentVoteId ?? undefined,
    }));
  }

  /** 只取当日 itinerary 行，不走 getTripState / 全量 TripDay */
  private async loadTodayItemsLight(
    tripId: string,
    startDate: Date | undefined,
    endDate: Date | undefined,
    localDate: string,
    timezone: string,
  ): Promise<LightItineraryItem[]> {
    if (!startDate || !endDate) return [];
    const dayNumber = resolveDayNumber(
      startDate,
      endDate,
      DateTime.fromISO(localDate, { zone: timezone }).isValid
        ? DateTime.fromISO(localDate, { zone: timezone })
        : DateTime.now().setZone(timezone),
    );
    const day = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      skip: Math.max(0, dayNumber - 1),
      take: 1,
      select: {
        ItineraryItem: {
          orderBy: { startTime: 'asc' },
          select: {
            startTime: true,
            endTime: true,
            note: true,
            type: true,
            bookingStatus: true,
            travelFromPreviousDuration: true,
            travelFromPreviousDistance: true,
            placeId: true,
            Place: { select: { id: true, nameCN: true, nameEN: true, category: true } },
          },
        },
      },
    });
    const items = day[0]?.ItineraryItem ?? [];
    const placeIds = [
      ...new Set(
        items
          .map((i) => i.placeId ?? i.Place?.id)
          .filter((id): id is number => typeof id === 'number' && id > 0),
      ),
    ];
    const coordById = new Map<number, { lat: number; lng: number }>();
    if (placeIds.length > 0) {
      try {
        const coords = await this.prisma.$queryRaw<
          Array<{ id: number; lat: number; lng: number }>
        >`
          SELECT
            p.id,
            ST_Y(p.location::geometry) as lat,
            ST_X(p.location::geometry) as lng
          FROM "Place" p
          WHERE p.id IN (${Prisma.join(placeIds)})
            AND p.location IS NOT NULL
        `;
        for (const c of coords) {
          if (Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng))) {
            coordById.set(Number(c.id), { lat: Number(c.lat), lng: Number(c.lng) });
          }
        }
      } catch {
        // 坐标可选；无 PostGIS 时仍返回行程文案
      }
    }
    const now = DateTime.now().setZone(timezone);
    return items.map((item) => {
      const title = item.Place?.nameCN ?? item.Place?.nameEN ?? item.note ?? '行程项';
      const start = item.startTime ? DateTime.fromJSDate(item.startTime).setZone(timezone) : null;
      const end = item.endTime ? DateTime.fromJSDate(item.endTime).setZone(timezone) : null;
      let status = 'upcoming';
      if (end && end < now) status = 'completed';
      else if (start && start <= now) status = 'inProgress';
      const placeId = item.placeId ?? item.Place?.id;
      const coord = placeId != null ? coordById.get(placeId) : undefined;
      const distM = item.travelFromPreviousDistance;
      return {
        time: item.startTime ? formatTimeHHmm(item.startTime) : undefined,
        endTime: item.endTime ? formatTimeHHmm(item.endTime) : undefined,
        title,
        location: item.Place?.nameCN ?? item.Place?.nameEN ?? undefined,
        status,
        itemType: item.type,
        placeCategory: item.Place?.category ?? undefined,
        bookingStatus: item.bookingStatus,
        travelFromPreviousMin:
          typeof item.travelFromPreviousDuration === 'number'
            ? item.travelFromPreviousDuration
            : null,
        travelFromPreviousKm:
          typeof distM === 'number' && distM > 0 ? Math.round((distM / 1000) * 10) / 10 : null,
        note: item.note,
        lat: coord?.lat,
        lng: coord?.lng,
      };
    });
  }

  /**
   * Place 油站 + 今日/明日行程途经点走廊投影（只读；pack seed 作兜底）。
   */
  private async loadFuelCorridorProjection(
    tripId: string,
    startDate: Date | undefined,
    endDate: Date | undefined,
    localDate: string,
    timezone: string,
  ) {
    const [placeStations, waypoints, packStations] = await Promise.all([
      this.loadPlaceFuelStationsSafe(),
      this.loadCorridorWaypointsLight(tripId, startDate, endDate, localDate, timezone),
      Promise.resolve(loadIcelandFuelStationProfiles().stations),
    ]);

    const plan = buildLightTripPlanFromWaypoints(waypoints, tripId);
    if (!plan) {
      return {
        stations: [],
        nextStationKm: undefined,
        todayRemainingKm: undefined,
        tomorrowMorningKm: undefined,
        placeStationCount: placeStations.length,
        corridorKm: 0,
      };
    }

    return projectFuelStationsOntoTripCorridor({
      plan,
      placeStations,
      packStations,
      cumulativeKm: 0,
      maxStations: 3,
    });
  }

  private async loadPlaceFuelStationsSafe() {
    try {
      return await loadIcelandFuelStationsFromPlaceCached(this.prisma);
    } catch {
      return getCachedIcelandPlaceFuelStations();
    }
  }

  /** 详情热路径：只拉附近停车，避免全岛 5k+ 扫描 */
  private async loadPlaceParkingNearSafe(lat: number, lng: number) {
    try {
      return await loadIcelandParkingNearPoint(this.prisma, {
        lat,
        lng,
        radiusKm: 80,
        limit: 40,
      });
    } catch {
      return [];
    }
  }

  /** 今日 + 明日 itinerary Place 坐标（走廊顶点） */
  private async loadCorridorWaypointsLight(
    tripId: string,
    startDate: Date | undefined,
    endDate: Date | undefined,
    localDate: string,
    timezone: string,
  ): Promise<CorridorDayWaypoints[]> {
    if (!startDate || !endDate) return [];
    const dayNumber = resolveDayNumber(
      startDate,
      endDate,
      DateTime.fromISO(localDate, { zone: timezone }).isValid
        ? DateTime.fromISO(localDate, { zone: timezone })
        : DateTime.now().setZone(timezone),
    );
    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      skip: Math.max(0, dayNumber - 1),
      take: 2,
      select: {
        date: true,
        ItineraryItem: {
          orderBy: { startTime: 'asc' },
          select: { placeId: true },
        },
      },
    });
    if (days.length === 0) return [];

    const placeIds = [
      ...new Set(
        days.flatMap((d) =>
          d.ItineraryItem.map((i) => i.placeId).filter(
            (id): id is number => typeof id === 'number' && id > 0,
          ),
        ),
      ),
    ];
    if (placeIds.length === 0) return [];

    const coords = await this.prisma.$queryRaw<
      Array<{ id: number; lat: number; lng: number }>
    >`
      SELECT
        p.id,
        ST_Y(p.location::geometry) as lat,
        ST_X(p.location::geometry) as lng
      FROM "Place" p
      WHERE p.id IN (${Prisma.join(placeIds)})
        AND p.location IS NOT NULL
    `;
    const byId = new Map(
      coords
        .filter((c) => Number.isFinite(Number(c.lat)) && Number.isFinite(Number(c.lng)))
        .map((c) => [Number(c.id), { lat: Number(c.lat), lng: Number(c.lng) }] as const),
    );

    return days.map((d) => {
      const date =
        d.date instanceof Date
          ? DateTime.fromJSDate(d.date).toISODate() ?? localDate
          : String(d.date).slice(0, 10);
      const points = d.ItineraryItem.map((i) =>
        i.placeId != null ? byId.get(i.placeId) : undefined,
      ).filter((p): p is { lat: number; lng: number } => !!p);
      // 去连续重复点
      const deduped: { lat: number; lng: number }[] = [];
      for (const p of points) {
        const last = deduped[deduped.length - 1];
        if (
          last &&
          Math.abs(last.lat - p.lat) < 1e-5 &&
          Math.abs(last.lng - p.lng) < 1e-5
        ) {
          continue;
        }
        deduped.push(p);
      }
      return { date, points: deduped };
    });
  }

  private resolveScheduleFromLight(items: LightItineraryItem[]) {
    if (!items.length) {
      return {
        nextHardWindowZh: '下一个硬时间窗：暂无',
        checkInZh: '住宿入住：待确认',
        attention: false,
      };
    }
    const upcoming = items.find(
      (i) => i.status === 'upcoming' || i.status === 'inProgress' || i.status === 'delayed',
    );
    const lodging = items.find((i) =>
      /住宿|酒店|民宿|旅馆|hotel|lodge|check.?in/i.test(`${i.title} ${i.location ?? ''}`),
    );
    return {
      nextHardWindowZh: upcoming
        ? `下一个硬时间窗：${upcoming.title}${upcoming.time ? ` ${upcoming.time}` : ''}`
        : '下一个硬时间窗：暂无',
      checkInZh: lodging ? `住宿入住：${lodging.time || '待确认'}` : '住宿入住：待确认',
      attention: upcoming?.status === 'delayed' || upcoming?.status === 'risk',
    };
  }

  private resolveSuggestedDepartFromLight(
    items: LightItineraryItem[],
    timezone: string,
    localDate: string,
  ): { labelZh?: string; at?: string } {
    const first = items[0];
    if (!first?.time || first.time === '--:--') return {};
    const match = /^(\d{1,2}):(\d{2})$/.exec(first.time.trim());
    if (!match) return { labelZh: `建议 ${first.time} 前离开` };
    const hour = Number(match[1]);
    const minute = Number(match[2]);
    const depart = DateTime.fromISO(localDate, { zone: timezone }).set({
      hour: Math.max(0, hour - 1),
      minute,
      second: 0,
      millisecond: 0,
    });
    if (!depart.isValid) return { labelZh: `建议 ${first.time} 前离开` };
    return {
      labelZh: `建议 ${formatTimeHHmm(depart.toISO())} 前离开`,
      at: depart.toUTC().toISO() ?? undefined,
    };
  }

  private readStoredConfirmation(
    metadata: unknown,
    localDate: string,
  ): DailyDriveStoredConfirmation | undefined {
    const meta =
      metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
    const mobile = (meta.mobileExecution as MobileMetaWithDailyDrive) ?? {};
    return mobile.dailyDrive?.byLocalDate?.[localDate];
  }

  private projectLightRoad(
    topEnv: EnvironmentEventSummary | undefined,
    plow?: PlowLite,
  ): {
    alertTitle?: string;
    alertDetail?: string;
    severity?: 'high' | 'medium' | 'low' | 'ok';
    plowServiceBand?: string;
  } {
    const severity =
      topEnv?.severity === 'red'
        ? 'high'
        : topEnv?.severity === 'yellow'
          ? 'medium'
          : 'ok';
    return {
      alertTitle: topEnv?.description?.slice(0, 60) ?? '路况正常',
      alertDetail: topEnv?.description ?? '暂无显著道路或天气影响',
      severity,
      plowServiceBand: plow?.plowServiceBand,
    };
  }

  /** 从环境事件粗估驾驶延误区间（分钟），供 SCHEDULE 影响区 */
  private estimateScheduleDelayFromEnv(
    envEvents: EnvironmentEventSummary[],
  ): { min: number; max: number } {
    if (!envEvents.length) return { min: 0, max: 0 };
    const worst = envEvents.reduce((acc, ev) => {
      const rank = ev.severity === 'red' ? 3 : ev.severity === 'yellow' ? 2 : 1;
      return rank > acc ? rank : acc;
    }, 0);
    if (worst >= 3) return { min: 40, max: 60 };
    if (worst >= 2) return { min: 20, max: 40 };
    return { min: 0, max: 0 };
  }

  private resolveDaylight(
    localDate: string,
    timezone: string,
    geo?: { lat?: number; lng?: number },
  ) {
    const fact = resolveDaylightFact({
      date: localDate,
      lat: geo?.lat ?? ICELAND_DAYLIGHT_FALLBACK_LAT,
      lng: geo?.lng ?? ICELAND_DAYLIGHT_FALLBACK_LNG,
      timezone,
    });
    if ('degraded' in fact) {
      return {
        sunriseLabel: '—',
        sunsetLabel: '—',
        dawnLabel: undefined as string | undefined,
        duskLabel: undefined as string | undefined,
        sunriseMinutes: undefined as number | undefined,
        sunsetMinutes: undefined as number | undefined,
        dawnMinutes: undefined as number | undefined,
        duskMinutes: undefined as number | undefined,
        nightDriveLabelZh: '日照数据暂不可用',
        attention: true,
      };
    }
    const dayMinutes = fact.sunsetMinutes - fact.sunriseMinutes;
    const attention = dayMinutes < 8 * 60;
    const nightDriveMins = Math.max(0, 22 * 60 - fact.sunsetMinutes);
    const nightLabel =
      nightDriveMins > 0
        ? `夜间驾驶约 ${Math.floor(nightDriveMins / 60)} 小时 ${nightDriveMins % 60} 分钟`
        : '当日无明显夜间驾驶';
    const dawnMinutes = (() => {
      const label = fact.civilDawnLocal;
      if (!label) return Math.max(0, fact.sunriseMinutes - 90);
      const m = /^(\d{1,2}):(\d{2})$/.exec(label.trim());
      if (!m) return Math.max(0, fact.sunriseMinutes - 90);
      return Number(m[1]) * 60 + Number(m[2]);
    })();
    return {
      sunriseLabel: fact.sunriseLocal,
      sunsetLabel: fact.sunsetLocal,
      dawnLabel: fact.civilDawnLocal,
      duskLabel: fact.civilDuskLocal,
      sunriseMinutes: fact.sunriseMinutes,
      sunsetMinutes: fact.sunsetMinutes,
      dawnMinutes,
      duskMinutes: fact.civilDuskMinutes,
      nightDriveLabelZh: nightLabel,
      attention,
    };
  }

  /** 仅读 metadata；无值返回 undefined（禁止硬编码假 km）。 */
  private estimateNextFuelKmFromMeta(metadata: unknown): number | undefined {
    const meta =
      metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
    const km = meta.nextFuelStationKm ?? meta.nextReliableFuelKm;
    if (typeof km === 'number' && Number.isFinite(km)) return km;
    return undefined;
  }

  /** @deprecated 兼容详情路径；优先走廊投影。 */
  private estimateNextFuelKm(metadata: unknown): number | undefined {
    return this.estimateNextFuelKmFromMeta(metadata);
  }

  private validatePayload(
    body: Partial<DailyDriveConfirmPayload> & Record<string, unknown>,
    _tripId: string,
  ): DailyDriveConfirmPayload {
    const fuelLevel = body.fuelLevel as DailyDriveFuelLevel | undefined;
    const fatigue = body.fatigue as DailyDriveFatigue | undefined;
    if (!fuelLevel || !FUEL_LEVELS.includes(fuelLevel)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `fuelLevel 必须是: ${FUEL_LEVELS.join(' | ')}`,
      });
    }
    if (!fatigue || !FATIGUE_LEVELS.includes(fatigue)) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: `fatigue 必须是: ${FATIGUE_LEVELS.join(' | ')}`,
      });
    }
    if (typeof body.departOnPlan !== 'boolean') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'departOnPlan 必须为 boolean',
      });
    }
    if (typeof body.vehicleAbnormal !== 'boolean') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'vehicleAbnormal 必须为 boolean',
      });
    }
    if (typeof body.prepCompleted !== 'boolean') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'prepCompleted 必须为 boolean',
      });
    }
    if (!body.driverMemberId || typeof body.driverMemberId !== 'string') {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'driverMemberId 必填',
      });
    }
    return {
      fuelLevel,
      departOnPlan: body.departOnPlan,
      driverMemberId: body.driverMemberId,
      fatigue,
      vehicleAbnormal: body.vehicleAbnormal,
      prepCompleted: body.prepCompleted,
      vehicleNoteZh:
        typeof body.vehicleNoteZh === 'string' ? body.vehicleNoteZh : undefined,
      prepNoteZh: typeof body.prepNoteZh === 'string' ? body.prepNoteZh : undefined,
    };
  }

  private resolveTimezone(metadata: unknown): string {
    const meta =
      metadata && typeof metadata === 'object' ? (metadata as Record<string, unknown>) : {};
    const tz = meta.timezone;
    return typeof tz === 'string' && tz.trim() ? tz.trim() : DEFAULT_TRIP_DISPLAY_TIMEZONE;
  }

  private resolveLocalDate(timezone: string, override?: string): string {
    if (override?.trim()) {
      const parsed = DateTime.fromISO(override.trim(), { zone: timezone });
      if (!parsed.isValid) {
        throw new BadRequestException({
          code: 'VALIDATION_ERROR',
          message: 'localDate 必须是 yyyy-MM-dd',
        });
      }
      return parsed.toISODate()!;
    }
    return DateTime.now().setZone(timezone).toISODate()!;
  }

  /** 轻量版本：不 assemble snapshot（详情/草稿够用；写冲突仍走 assertContextVersion） */
  private resolveContextVersionLight(tripUpdatedAt: Date): number {
    return computeMobileContextVersion({
      constraintsVersion: 0,
      tripUpdatedAt,
    });
  }

  private async resolveContextVersion(tripId: string, tripUpdatedAt: Date): Promise<number> {
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    return computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });
  }

  private async loadStoredConfirmation(
    tripId: string,
    localDate: string,
  ): Promise<DailyDriveStoredConfirmation | undefined> {
    const mobile = await this.loadMobileMeta(tripId);
    return mobile.dailyDrive?.byLocalDate?.[localDate];
  }

  private async loadDriverOptions(tripId: string): Promise<DailyDriveDriverOptionDto[]> {
    const rows = await this.prisma.tripCollaborator.findMany({ where: { tripId } });
    const userIds = rows.map((r) => r.userId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true, avatarUrl: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const sorted = [...rows].sort((a, b) => {
      const rank = (role: string) =>
        role === 'OWNER' ? 0 : role === 'EDITOR' ? 1 : 2;
      return rank(a.role) - rank(b.role);
    });
    return sorted.map((row, idx) => {
      const u = userMap.get(row.userId);
      return {
        memberId: row.userId,
        displayName: u?.displayName ?? u?.email?.split('@')[0] ?? '成员',
        avatarUrl: u?.avatarUrl ?? null,
        isPrimaryDriver: idx === 0,
      };
    });
  }

  private async loadMemberIds(tripId: string): Promise<Set<string>> {
    const rows = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
      select: { userId: true },
    });
    return new Set(rows.map((r) => r.userId));
  }

  private async loadMobileMeta(tripId: string): Promise<MobileMetaWithDailyDrive> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    return ((metadata.mobileExecution as MobileMetaWithDailyDrive) ?? {}) as MobileMetaWithDailyDrive;
  }

  private async saveMobileMeta(tripId: string, mobile: MobileMetaWithDailyDrive) {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) throw new NotFoundException(`行程 ${tripId} 不存在`);
    const metadata = (trip.metadata as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...metadata,
          mobileExecution: mobile,
        }),
      },
    });
  }
}
