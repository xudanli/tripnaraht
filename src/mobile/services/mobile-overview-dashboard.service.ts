import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import { TripsService } from '../../trips/trips.service';
import { ConsumerDecisionQueueService } from '../../trips/travel-status/services/consumer-decision-queue.service';
import { DEFAULT_TRIP_DISPLAY_TIMEZONE } from '../../common/utils/format-clock-label.util';
import { formatTimeHHmm, mapCollaboratorRole, resolveDayNumber } from '../utils/mobile-execution.util';
import { projectOverviewDashboard } from '../utils/overview-dashboard.projection.util';
import { projectDriveSession } from '../utils/drive-session.projection.util';
import {
  OVERVIEW_VEHICLE_DETAIL_SCHEMA_ID,
  type DriveSessionDto,
  type OverviewDashboardDto,
  type OverviewVehicleDetailDto,
  type OverviewVehicleFuelStationDto,
  type StoredDriveSession,
} from '../dto/mobile-overview-dashboard.types';
import {
  MEMBER_STATUS_REPORT_TTL_MS,
  type StoredMemberStatusReport,
  type StoredTripFieldReport,
} from '../dto/mobile-execution-quick-actions.types';
import {
  NEED_LABEL_ZH,
  isOpenLifecycle,
} from '../utils/execution-quick-actions.projection.util';
import { MobileDailyDriveService } from './mobile-daily-drive.service';
import { MobileExecutionService } from './mobile-execution.service';
import type { MobileNavigationSessionDto } from '../dto/mobile-execution.types';
import {
  buildSelfDriveContext,
  type DriveAdvisory,
  type SelfDriveContext,
} from '../../trips/self-drive-kernel';
import type {
  OverviewDriveAdvisoryDto,
  OverviewSelfDriveKernelShadowDto,
} from '../dto/mobile-overview-dashboard.types';

const SUPPLY_NEAR_RADIUS_M = 120_000;
const SUPPLY_NEAR_LIMIT = 5;

@Injectable()
export class MobileOverviewDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly dailyDrive: MobileDailyDriveService,
    private readonly mobileRead: MobileExecutionService,
    private readonly tripsService: TripsService,
    private readonly decisionQueue: ConsumerDecisionQueueService,
  ) {}

  /**
   * 新总览首屏投影。
   * P2：不再依赖旧 GET execution-overview；仅用 daily-drive / alerts / itinerary light / trip-state。
   */
  async getOverviewDashboard(
    tripId: string,
    userId: string,
    opts?: { lite?: boolean; dayIndex?: number },
  ): Promise<OverviewDashboardDto> {
    const lite = opts?.lite !== false;
    const trip = await this.access.assertTripMember(tripId, userId);

    const [dailyStatus, confirmDraft, teamLight, alerts, nextEnrich, adjustCount, nextStopLight] =
      await Promise.all([
        this.dailyDrive
          .getStatus(tripId, userId, { includeReminders: false })
          .catch(() => null),
        this.dailyDrive.getConfirmDraft(tripId, userId).catch(() => null),
        this.loadTeamReadinessLight(tripId),
        this.mobileRead.getExecutionAlerts(tripId, userId).catch(() => null),
        this.resolveNextEnrichment(tripId, trip, opts?.dayIndex, lite),
        this.loadPendingAdjustmentCountLight(tripId, trip.metadata),
        this.loadNextStopLight(tripId),
      ]);

    const contextVersion =
      dailyStatus?.contextVersion ??
      confirmDraft?.contextVersion ??
      alerts?.contextVersion ??
      0;

    const confirmPayload =
      confirmDraft?.lastSubmission ?? confirmDraft?.defaults ?? null;

    const alertCount =
      (alerts?.primaryRisk?.requiresImmediateAttention ? 1 : 0) +
      (alerts?.alerts?.filter((a) => a.requiresImmediateAttention).length ?? 0);

    const primaryRiskId =
      alerts?.primaryRisk?.riskId ?? alerts?.primaryRisk?.id ?? undefined;

    const metaExtras = this.readTripMetaExtras(trip.metadata, lite);
    const driveSession = this.resolveDriveSessionFromTrip(
      trip.metadata,
      dailyStatus?.localDate,
      dailyStatus?.timezone,
      dailyStatus?.gate,
      !!dailyStatus?.confirmation?.isConfirmed,
      contextVersion,
      confirmPayload?.driverMemberId,
    );

    // K4：Self-Drive Kernel 影子（CN/IS 同构 advisories；不抬升 overallStatus）
    const kernelShadow = this.buildKernelShadowProjection({
      tripId,
      destination: trip.destination,
      metadata: trip.metadata,
      startDate: trip.startDate,
      endDate: trip.endDate,
      localDate: dailyStatus?.localDate,
      timezone: dailyStatus?.timezone,
      dayIndex: opts?.dayIndex,
    });

    // full：live route 补 ETA；lite：用 trip-state nextStop ETA（轻量，非 execution-overview）
    if (!lite) {
      const live = await this.mobileRead.getLiveRoute(tripId, userId).catch(() => null);
      const liveEta = live?.eta && live.eta !== '--:--' ? live.eta : undefined;
      if (nextEnrich.next && liveEta) {
        nextEnrich.next.etaLocalHHmm = liveEta;
      }
    }

    if (nextEnrich.next && !nextEnrich.next.etaLocalHHmm && nextStopLight?.etaLocalHHmm) {
      nextEnrich.next.etaLocalHHmm = nextStopLight.etaLocalHHmm;
    }
    if (nextEnrich.next && !nextEnrich.next.titleZh && nextStopLight?.titleZh) {
      nextEnrich.next.titleZh = nextStopLight.titleZh;
    }

    // currentActivity：兼容旧字段；优先 next，停留态用 nowStop 补 location
    const currentActivity = {
      title:
        nextEnrich.next?.titleZh ??
        nextEnrich.nowStop?.titleZh ??
        nextStopLight?.titleZh,
      estimatedArrival: nextEnrich.next?.etaLocalHHmm ?? nextStopLight?.etaLocalHHmm,
      progress: nextStopLight?.progress,
      imageUrl: nextEnrich.next?.imageUrl ?? nextEnrich.nowStop?.imageUrl,
      locationName:
        nextEnrich.nowStop?.titleZh ??
        nextEnrich.next?.titleZh ??
        nextStopLight?.titleZh,
    };

    // 权威 ARRIVED 且尚无 nowStop 时，用 next 回填停留点（到达即当前站）
    const nowStop =
      nextEnrich.nowStop ??
      (driveSession.phase === 'ARRIVED' ? nextEnrich.next : undefined);

    return projectOverviewDashboard({
      lite,
      contextVersion,
      serverTime: new Date().toISOString(),
      trafficUpdatedAt: dailyStatus?.evidence?.updatedAt,
      dailyDrive: dailyStatus,
      confirmPayload,
      driverOptions: confirmDraft?.driverOptions,
      currentActivity,
      pendingAdjustmentCount: adjustCount,
      alertCount,
      primaryRiskId,
      next: nextEnrich.next,
      nowStop,
      lodging: nextEnrich.lodging,
      team: teamLight,
      activeRunbookId: metaExtras.activeRunbookId,
      rentalEmergencyPhone: metaExtras.rentalEmergencyPhone,
      vehicleTypeZh: metaExtras.vehicleTypeZh ?? kernelShadow.vehicleTypeZh,
      continuousDriveWarningZh: driveSession.continuousDriveWarningZh,
      driveSession: {
        continuousDriveMinutes: driveSession.continuousDriveMinutes,
        todayDrivenMinutes: driveSession.todayDrivenMinutes,
        todayRemainingDriveMinutes: driveSession.todayRemainingDriveMinutes,
        phase: driveSession.phase,
        temporaryStop: driveSession.phase === 'TEMPORARY_STOP',
        arrivedAtDestination: driveSession.phase === 'ARRIVED',
        dayEnded: driveSession.phase === 'DAY_ENDED',
      },
      offlineMapAvailable: false,
      advisories: kernelShadow.advisories,
      selfDriveKernel: kernelShadow.selfDriveKernel,
    });
  }
  async getDriveSession(tripId: string, userId: string): Promise<DriveSessionDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const timezone = this.resolveTimezone(trip.metadata);
    const localDate =
      DateTime.now().setZone(timezone).toISODate() ??
      new Date().toISOString().slice(0, 10);
    const dailyStatus = await this.dailyDrive
      .getStatus(tripId, userId, { includeReminders: false })
      .catch(() => null);
    const confirmDraft = await this.dailyDrive
      .getConfirmDraft(tripId, userId, { localDate: dailyStatus?.localDate ?? localDate })
      .catch(() => null);
    const contextVersion =
      dailyStatus?.contextVersion ?? confirmDraft?.contextVersion ?? 0;

    return this.resolveDriveSessionFromTrip(
      trip.metadata,
      dailyStatus?.localDate ?? localDate,
      dailyStatus?.timezone ?? timezone,
      dailyStatus?.gate,
      !!dailyStatus?.confirmation?.isConfirmed,
      contextVersion,
      confirmDraft?.lastSubmission?.driverMemberId ??
        confirmDraft?.defaults?.driverMemberId,
    );
  }

  async getVehicleDetail(
    tripId: string,
    userId: string,
  ): Promise<OverviewVehicleDetailDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const [dailyStatus, confirmDraft, driveSession, nextEnrich] = await Promise.all([
      this.dailyDrive
        .getStatus(tripId, userId, { includeReminders: false })
        .catch(() => null),
      this.dailyDrive.getConfirmDraft(tripId, userId).catch(() => null),
      this.getDriveSession(tripId, userId),
      this.resolveNextEnrichment(tripId, trip, undefined, false),
    ]);

    const metaExtras = this.readTripMetaExtras(trip.metadata, false);
    const confirmPayload =
      confirmDraft?.lastSubmission ?? confirmDraft?.defaults ?? null;
    const fuelDim = dailyStatus?.dimensions?.find((d) => d.code === 'FUEL');
    const roadDim = dailyStatus?.dimensions?.find((d) => d.code === 'ROAD');
    const nextFuelMatch = fuelDim?.detailZh?.match(/(\d+)\s*km/i);

    const projected = projectOverviewDashboard({
      lite: false,
      contextVersion: driveSession.contextVersion,
      serverTime: new Date().toISOString(),
      dailyDrive: dailyStatus,
      confirmPayload,
      rentalEmergencyPhone: metaExtras.rentalEmergencyPhone,
      vehicleTypeZh: metaExtras.vehicleTypeZh,
      continuousDriveWarningZh: driveSession.continuousDriveWarningZh,
      team: { totalCount: 0, readyMemberIds: [] },
      driveSession: {
        continuousDriveMinutes: driveSession.continuousDriveMinutes,
        todayDrivenMinutes: driveSession.todayDrivenMinutes,
        phase: driveSession.phase,
      },
    });

    const lat = nextEnrich.next?.latitude;
    const lng = nextEnrich.next?.longitude;
    const nearby =
      lat != null && lng != null
        ? await this.loadNearbySupplyStations(lat, lng)
        : { fuel: [] as OverviewVehicleFuelStationDto[], charging: [] as OverviewVehicleFuelStationDto[] };

    const fuelStations: OverviewVehicleFuelStationDto[] =
      nearby.fuel.length > 0
        ? nearby.fuel
        : nextFuelMatch
          ? [
              {
                nameZh: '下一可靠油站',
                distanceKm: Number(nextFuelMatch[1]),
                distanceZh: `${nextFuelMatch[1]} km`,
                tagZh: '推荐',
              },
            ]
          : [];

    const forbiddenRoads: OverviewVehicleDetailDto['forbiddenRoads'] = [];
    if (roadDim && roadDim.status !== 'OK') {
      forbiddenRoads.push({
        titleZh: roadDim.status === 'BLOCKED' ? '道路阻断风险' : '道路需关注',
        detailZh: roadDim.detailZh,
        severityZh: roadDim.statusLabelZh,
      });
    }

    return {
      schemaId: OVERVIEW_VEHICLE_DETAIL_SCHEMA_ID,
      contextVersion: projected.contextVersion,
      serverTime: projected.serverTime,
      summary: projected.vehicle,
      rentalEmergencyPhone: metaExtras.rentalEmergencyPhone,
      vehicleTypeZh: metaExtras.vehicleTypeZh ?? projected.vehicle.vehicleTypeZh,
      roadFitZh: projected.vehicle.roadFitZh,
      forbiddenRoads,
      fuelStations,
      chargingStations: nearby.charging,
      continuousDriveWarningZh: driveSession.continuousDriveWarningZh,
    };
  }

  /** P2：轻量待调整计数，不走旧 execution-overview.statusRows */
  private async loadPendingAdjustmentCountLight(
    tripId: string,
    metadata: unknown,
  ): Promise<number> {
    const meta =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : {};
    const mobile =
      (meta.mobileExecution as {
        localAdjustmentItems?: unknown[];
      }) ?? {};
    const localCount = Array.isArray(mobile.localAdjustmentItems)
      ? mobile.localAdjustmentItems.length
      : 0;

    const queue = await this.decisionQueue
      .getQueue(tripId, { hydrateRecommendations: false })
      .catch(() => null);
    const openCount = queue?.openCount ?? 0;
    return Math.max(localCount, openCount);
  }

  /** P2：trip-state nextStop，替代 execution-overview.currentActivity */
  private async loadNextStopLight(tripId: string): Promise<{
    titleZh?: string;
    etaLocalHHmm?: string;
    progress?: number;
  } | null> {
    const state = await this.tripsService.getTripState(tripId).catch(() => null);
    if (!state?.nextStop) return null;
    const eta = formatTimeHHmm(state.nextStop.estimatedArrivalTime ?? state.eta);
    return {
      titleZh: state.nextStop.placeName ?? undefined,
      etaLocalHHmm: eta && eta !== '--:--' ? eta : undefined,
      progress: undefined,
    };
  }

  /** 下一站附近油站 / 充电站（PostGIS；失败则空） */
  private async loadNearbySupplyStations(
    lat: number,
    lng: number,
  ): Promise<{
    fuel: OverviewVehicleFuelStationDto[];
    charging: OverviewVehicleFuelStationDto[];
  }> {
    try {
      const rows = await this.prisma.$queryRaw<
        Array<{
          nameCN: string | null;
          nameEN: string | null;
          canonical: string | null;
          distance_meters: number;
        }>
      >`
        SELECT
          p."nameCN",
          p."nameEN",
          UPPER(COALESCE(p.metadata->>'canonicalType', '')) as canonical,
          ST_Distance(
            p.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography
          ) as distance_meters
        FROM "Place" p
        WHERE p.location IS NOT NULL
          AND p.category = 'SUPPLY'::"PlaceCategory"
          AND ST_DWithin(
            p.location,
            ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
            ${SUPPLY_NEAR_RADIUS_M}
          )
          AND (
            UPPER(COALESCE(p.metadata->>'canonicalType', '')) LIKE 'FUEL_%'
            OR UPPER(COALESCE(p.metadata->>'canonicalType', '')) = 'EV_CHARGING'
            OR COALESCE(p."nameCN",'') ~ '加油站|加油|充电'
            OR COALESCE(p."nameEN",'') ~* '(N1|Orkan|Olis|charging|charger|EV)'
          )
        ORDER BY distance_meters ASC
        LIMIT ${SUPPLY_NEAR_LIMIT * 2}
      `;

      const fuel: OverviewVehicleFuelStationDto[] = [];
      const charging: OverviewVehicleFuelStationDto[] = [];
      for (const r of rows) {
        const km = Math.round((Number(r.distance_meters) / 1000) * 10) / 10;
        const nameZh = (r.nameCN || r.nameEN || '补给点').trim();
        const isEv =
          r.canonical === 'EV_CHARGING' ||
          /充电|charging|charger|\bev\b/i.test(`${r.nameCN ?? ''} ${r.nameEN ?? ''}`);
        const row: OverviewVehicleFuelStationDto = {
          nameZh,
          distanceKm: km,
          distanceZh: `${km} km`,
          durationZh:
            Number.isFinite(km) && km > 0
              ? `约 ${Math.max(1, Math.round((km / 80) * 60))} 分钟`
              : undefined,
          tagZh: isEv ? '充电' : fuel.length === 0 ? '推荐' : '附近',
        };
        if (isEv) {
          if (charging.length < SUPPLY_NEAR_LIMIT) charging.push(row);
        } else if (fuel.length < SUPPLY_NEAR_LIMIT) {
          fuel.push(row);
        }
      }
      return { fuel, charging };
    } catch {
      return { fuel: [], charging: [] };
    }
  }

  private resolveDriveSessionFromTrip(
    metadata: unknown,
    localDate: string | undefined,
    timezone: string | undefined,
    gate: 'CAN_DEPART' | 'NEEDS_ATTENTION' | 'BLOCKED' | undefined,
    isConfirmed: boolean,
    contextVersion: number,
    fallbackDriverId?: string,
  ): DriveSessionDto {
    const tz = timezone?.trim() || DEFAULT_TRIP_DISPLAY_TIMEZONE;
    const date =
      localDate ??
      DateTime.now().setZone(tz).toISODate() ??
      new Date().toISOString().slice(0, 10);
    const meta =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : {};
    const mobile =
      (meta.mobileExecution as {
        driveSession?: StoredDriveSession;
        navigationSessions?: Record<string, MobileNavigationSessionDto & { endedAt?: string }>;
        tripFieldReports?: StoredTripFieldReport[];
      }) ?? {};

    const navSessions = Object.values(mobile.navigationSessions ?? {}).map((s) => ({
      id: s.id,
      startedAt: s.startedAt,
      startedBy: s.startedBy,
      endedAt: s.endedAt,
    }));
    const fieldReports = (mobile.tripFieldReports ?? []).map((r) => ({
      actionCode: r.actionCode,
      reportedAt: r.reportedAt,
      reportedByMemberId: r.reportedByMemberId,
    }));

    const session = projectDriveSession({
      localDate: date,
      timezone: tz,
      contextVersion,
      stored: mobile.driveSession ?? null,
      dailyDriveGate: gate,
      isConfirmed,
      navSessions,
      fieldReports,
    });

    if (!session.lastDriverMemberId && fallbackDriverId) {
      session.lastDriverMemberId = fallbackDriverId;
    }
    return session;
  }

  /**
   * Self-Drive Kernel → overview 影子字段。
   * 失败时静默降级（不阻断首屏）。
   */
  private buildKernelShadowProjection(input: {
    tripId: string;
    destination: string | null;
    metadata: unknown;
    startDate: Date | null;
    endDate: Date | null;
    localDate?: string;
    timezone?: string;
    dayIndex?: number;
  }): {
    advisories?: OverviewDriveAdvisoryDto[];
    selfDriveKernel?: OverviewSelfDriveKernelShadowDto;
    vehicleTypeZh?: string;
  } {
    try {
      const ctx = buildSelfDriveContext({
        tripId: input.tripId,
        destination: input.destination || 'UNKNOWN',
        metadata: input.metadata,
        startDate: input.startDate,
        endDate: input.endDate,
        localDate: input.localDate,
        timezone: input.timezone,
        dayIndex: input.dayIndex,
      });
      return {
        advisories: this.toOverviewAdvisories(ctx.advisories),
        selfDriveKernel: this.toOverviewKernelShadow(ctx),
        vehicleTypeZh: this.vehicleTypeLabelZh(ctx),
      };
    } catch {
      return {};
    }
  }

  private toOverviewAdvisories(
    rows: DriveAdvisory[],
  ): OverviewDriveAdvisoryDto[] | undefined {
    if (!rows.length) return undefined;
    return rows.slice(0, 6).map((a) => ({
      type: a.type,
      severity: a.severity,
      titleZh: a.titleZh,
      summaryZh: a.summaryZh,
      affectedSegmentId: a.affectedSegmentId,
      validWindow: a.validWindow,
      recommendation: a.recommendation,
    }));
  }

  private toOverviewKernelShadow(
    ctx: SelfDriveContext,
  ): OverviewSelfDriveKernelShadowDto {
    const primary = ctx.roadEvidence[0];
    return {
      destinationPackId: ctx.destinationPackId,
      countryCode: ctx.countryCode,
      corridorId: ctx.route.corridorId,
      criticalSegmentCount: ctx.route.criticalSegments.length,
      roadEvidenceFreshness: primary?.freshness,
      roadStatus: primary?.status ?? ctx.roadConditions.status,
      roadStrongJudgmentAllowed: primary?.strongJudgmentAllowed ?? false,
    };
  }

  private vehicleTypeLabelZh(ctx: SelfDriveContext): string | undefined {
    const vt = ctx.vehicle?.vehicleType;
    if (!vt) return undefined;
    const map: Record<string, string> = {
      '2WD': '两驱',
      '4WD': '四驱',
      AWD: '全驱',
      CAMPERVAN: '房车',
      OTHER: '其他车型',
    };
    return map[vt] ?? vt;
  }

  private readTripMetaExtras(
    metadata: unknown,
    lite: boolean,
  ): {
    activeRunbookId?: string;
    rentalEmergencyPhone?: string;
    vehicleTypeZh?: string;
  } {
    const meta =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : {};
    const mobile =
      (meta.mobileExecution as {
        inTripHome?: {
          runbooksById?: Record<string, { status?: string }>;
        };
      }) ?? {};
    const runbooks = mobile.inTripHome?.runbooksById ?? {};
    let activeRunbookId: string | undefined;
    for (const [id, row] of Object.entries(runbooks)) {
      if (row?.status === 'ACTIVE') {
        activeRunbookId =
          typeof (row as { runbookId?: string }).runbookId === 'string'
            ? (row as { runbookId: string }).runbookId
            : id;
        break;
      }
    }

    if (lite) {
      return { activeRunbookId };
    }

    const readiness =
      (meta.selfDriveReadiness as Record<string, unknown> | undefined) ??
      (meta.readiness as Record<string, unknown> | undefined) ??
      {};
    const emergencyPhone =
      (typeof readiness.emergencyPhone === 'string' && readiness.emergencyPhone.trim()) ||
      (typeof meta.rentalEmergencyPhone === 'string' && meta.rentalEmergencyPhone.trim()) ||
      undefined;

    const vehicle =
      (meta.vehicle as Record<string, unknown> | undefined) ??
      (meta.icelandSelfDrive as Record<string, unknown> | undefined) ??
      {};
    const vehicleTypeZh =
      (typeof vehicle.labelZh === 'string' && vehicle.labelZh.trim()) ||
      (typeof vehicle.vehicleTypeZh === 'string' && vehicle.vehicleTypeZh.trim()) ||
      (typeof meta.vehicleTypeZh === 'string' && meta.vehicleTypeZh.trim()) ||
      undefined;

    return {
      activeRunbookId,
      rentalEmergencyPhone: emergencyPhone || undefined,
      vehicleTypeZh: vehicleTypeZh || undefined,
    };
  }

  private async loadTeamReadinessLight(tripId: string): Promise<{
    totalCount: number;
    readyMemberIds: string[];
    attentionNamesZh: string[];
    blocked: boolean;
  }> {
    const rows = await this.prisma.tripCollaborator.findMany({ where: { tripId } });
    const userIds = rows.map((r) => r.userId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));
    const members = rows.map((row) => ({
      id: row.userId,
      displayName:
        userMap.get(row.userId)?.displayName ??
        userMap.get(row.userId)?.email?.split('@')[0] ??
        '成员',
      role: mapCollaboratorRole(row.role),
    }));

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (tripRow?.metadata as Record<string, unknown>) ?? {};
    const mobile =
      (meta.mobileExecution as { memberStatusReports?: StoredMemberStatusReport[] }) ?? {};
    const reports = mobile.memberStatusReports ?? [];
    const now = Date.now();
    const attentionByMember = new Map<string, string>();
    let blocked = false;

    for (const r of reports) {
      if (!isOpenLifecycle(r.lifecycleStatus)) continue;
      const reportedMs = Date.parse(r.reportedAt);
      if (Number.isFinite(reportedMs) && now - reportedMs > MEMBER_STATUS_REPORT_TTL_MS) {
        continue;
      }
      const safety =
        r.priority === 'SAFETY_HIGH' ||
        r.lifecycleStatus === 'REPORTED' ||
        r.needCode === 'NEED_HELP';
      if (r.priority === 'SAFETY_HIGH') blocked = true;
      if (safety) {
        attentionByMember.set(
          r.subjectMemberId,
          NEED_LABEL_ZH[r.needCode] ?? r.needCode,
        );
      }
    }

    const readyMemberIds = members
      .filter((m) => !attentionByMember.has(m.id))
      .map((m) => m.id);
    const attentionNamesZh = members
      .filter((m) => attentionByMember.has(m.id))
      .map((m) => m.displayName);

    return {
      totalCount: members.length,
      readyMemberIds,
      attentionNamesZh,
      blocked,
    };
  }

  private async resolveNextEnrichment(
    tripId: string,
    trip: { startDate?: Date | null; endDate?: Date | null; metadata?: unknown },
    dayIndex: number | undefined,
    lite: boolean,
  ): Promise<{
    next?: {
      activityId?: string;
      titleZh?: string;
      placeTypeZh?: string;
      timeWindowStart?: string | null;
      timeWindowEnd?: string | null;
      distanceKm?: number;
      driveMinutes?: number;
      etaLocalHHmm?: string;
      latitude?: number;
      longitude?: number;
      imageUrl?: string;
      accessNoteZh?: string;
    };
    /** 时钟窗内的当前停留点；与 next 解耦供 Execution Projection */
    nowStop?: {
      activityId?: string;
      titleZh?: string;
      placeTypeZh?: string;
      timeWindowStart?: string | null;
      timeWindowEnd?: string | null;
      distanceKm?: number;
      driveMinutes?: number;
      latitude?: number;
      longitude?: number;
      imageUrl?: string;
      accessNoteZh?: string;
    };
    lodging?: {
      nameZh: string;
      detailZh?: string;
      statusZh?: string;
      imageUrl?: string;
    };
  }> {
    if (!trip.startDate || !trip.endDate) return {};

    const timezone = this.resolveTimezone(trip.metadata);
    const dayNumber = resolveDayNumber(
      trip.startDate,
      trip.endDate,
      DateTime.now().setZone(timezone),
      dayIndex,
    );

    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      skip: Math.max(0, dayNumber - 1),
      take: 1,
      select: {
        ItineraryItem: {
          orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
          select: {
            id: true,
            startTime: true,
            endTime: true,
            note: true,
            type: true,
            bookingStatus: true,
            travelFromPreviousDuration: true,
            travelFromPreviousDistance: true,
            placeId: true,
            Place: {
              select: {
                id: true,
                nameCN: true,
                nameEN: true,
                category: true,
                metadata: true,
              },
            },
          },
        },
      },
    });

    const items = days[0]?.ItineraryItem ?? [];
    if (!items.length) return {};

    const now = DateTime.now().setZone(timezone);
    const enriched = items.map((item) => {
      const title = item.Place?.nameCN ?? item.Place?.nameEN ?? item.note ?? '行程项';
      const start = item.startTime
        ? DateTime.fromJSDate(item.startTime).setZone(timezone)
        : null;
      const end = item.endTime
        ? DateTime.fromJSDate(item.endTime).setZone(timezone)
        : null;
      let status: 'completed' | 'inProgress' | 'upcoming' = 'upcoming';
      if (end && end < now) status = 'completed';
      else if (start && start <= now) status = 'inProgress';
      return { item, title, status };
    });

    // Now / Next 拆分：在店 ≠ 下一站
    const nowRow = enriched.find((r) => r.status === 'inProgress');
    const nextRow =
      (nowRow
        ? enriched.find(
            (r) => r.status === 'upcoming' && r.item.id !== nowRow.item.id,
          )
        : undefined) ??
      enriched.find((r) => r.status === 'upcoming') ??
      (!nowRow ? enriched[0] : undefined);

    const lodgingRow = enriched.find((r) => {
      const blob = `${r.title} ${r.item.Place?.category ?? ''} ${r.item.note ?? ''} ${r.item.type}`;
      return /住宿|酒店|民宿|旅馆|hotel|lodge|check.?in|accommodation|lodging/i.test(blob);
    });

    const placeIds = [nowRow?.item.placeId, nextRow?.item.placeId].filter(
      (id): id is number => id != null,
    );
    const coords =
      !lite && placeIds.length
        ? await this.loadPlaceCoords(placeIds)
        : new Map<number, { lat: number; lng: number }>();

    const toStop = (row: (typeof enriched)[number] | undefined) => {
      if (!row) return undefined;
      let lat: number | undefined;
      let lng: number | undefined;
      if (row.item.placeId != null) {
        const hit = coords.get(row.item.placeId);
        lat = hit?.lat;
        lng = hit?.lng;
      }
      const placeMeta =
        row.item.Place?.metadata && typeof row.item.Place.metadata === 'object'
          ? (row.item.Place.metadata as Record<string, unknown>)
          : {};
      if (lat == null || lng == null) {
        const metaLat = Number(placeMeta.lat ?? placeMeta.latitude);
        const metaLng = Number(placeMeta.lng ?? placeMeta.longitude);
        if (Number.isFinite(metaLat)) lat = metaLat;
        if (Number.isFinite(metaLng)) lng = metaLng;
      }
      const distM = row.item.travelFromPreviousDistance;
      return {
        activityId: row.item.id,
        titleZh: row.title,
        placeTypeZh: row.item.Place?.category
          ? String(row.item.Place.category)
          : undefined,
        timeWindowStart: row.item.startTime?.toISOString() ?? null,
        timeWindowEnd: row.item.endTime?.toISOString() ?? null,
        distanceKm:
          typeof distM === 'number' && distM > 0
            ? Math.round((distM / 1000) * 10) / 10
            : undefined,
        driveMinutes:
          typeof row.item.travelFromPreviousDuration === 'number'
            ? row.item.travelFromPreviousDuration
            : undefined,
        latitude: lat,
        longitude: lng,
        imageUrl:
          String(placeMeta.imageUrl ?? placeMeta.coverImageUrl ?? '') || undefined,
        accessNoteZh: String(placeMeta.accessNoteZh ?? '') || undefined,
      };
    };

    const nowStop = toStop(nowRow);
    // 无独立下一站时，兼容旧行为：用当前站充当 next（出发前 / 单点日）
    const next = toStop(nextRow) ?? (!nowStop ? undefined : nowStop);

    const lodgingMeta =
      lodgingRow?.item.Place?.metadata &&
      typeof lodgingRow.item.Place.metadata === 'object'
        ? (lodgingRow.item.Place.metadata as Record<string, unknown>)
        : {};

    const lodging = lodgingRow
      ? {
          nameZh: lodgingRow.title,
          detailZh: lodgingRow.item.startTime
            ? `今晚 ${formatTimeHHmm(lodgingRow.item.startTime)}`
            : '今晚时间待确认',
          statusZh: '已安排',
          imageUrl:
            String(lodgingMeta.imageUrl ?? lodgingMeta.coverImageUrl ?? '') || undefined,
        }
      : undefined;

    return { next, nowStop, lodging };
  }

  private async loadPlaceCoords(
    placeIds: number[],
  ): Promise<Map<number, { lat: number; lng: number }>> {
    const out = new Map<number, { lat: number; lng: number }>();
    if (!placeIds.length) return out;
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
          out.set(Number(c.id), { lat: Number(c.lat), lng: Number(c.lng) });
        }
      }
    } catch {
      // PostGIS 不可用时降级
    }
    return out;
  }

  private resolveTimezone(metadata: unknown): string {
    const meta =
      metadata && typeof metadata === 'object'
        ? (metadata as Record<string, unknown>)
        : {};
    const tz = meta.timezone ?? meta.timeZone;
    return typeof tz === 'string' && tz.trim()
      ? tz.trim()
      : DEFAULT_TRIP_DISPLAY_TIMEZONE;
  }
}
