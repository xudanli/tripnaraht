import { Injectable, NotFoundException, Optional } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { TripContextSnapshotAssemblerService } from '../../decision-runtime/snapshot/trip-context-snapshot.assembler.service';
import { TripsService } from '../../trips/trips.service';
import { ConsumerDecisionQueueService } from '../../trips/travel-status/services/consumer-decision-queue.service';
import type { UnifiedDecisionProblemListItem } from '../../decision-runtime/gateway/contracts/unified-decision-ui.types';
import { UnifiedDecisionProblemReadModelService } from '../../decision-runtime/gateway/services/unified-decision-problem-read-model.service';
import { isDecisionGatewayUnifiedEnabled } from '../../decision-runtime/gateway/config/decision-gateway.config';
import { TripTodayService } from '../../trips/in-trip-execution/services/trip-today.service';
import { EnvironmentRadarService } from '../../trips/in-trip-execution/services/environment-radar.service';
import { ExecutionAdvisoryService } from '../../trips/trip-constraint-solver/services/execution-advisory.service';
import { ConstraintSolverAccessService } from '../../trips/trip-constraint-solver/services/constraint-solver-access.service';
import type {
  MobileContextSnapshotDto,
  MobileExecutionOverviewDto,
  MobileLiveRouteDto,
  MobileMeetingPointDto,
  ExecutionAdjustmentQueueDto,
  ExecutionAlertsDto,
  ExecutionInterventionType,
  MobileRoadConditionsDto,
  MobileTeamStatusDto,
  MobileTodayItineraryDto,
  MobileTodayItineraryItemDto,
  MobileItineraryCalendarDto,
  MobileItineraryCalendarDayDto,
  MobileActivityExecutionDetailDto,
} from '../dto/mobile-execution.types';
import {
  attentionTypeIcon,
  computeDayProgress,
  computeMobileContextVersion,
  formatDurationMinutes,
  formatRemainingMinutes,
  formatTimeHHmm,
  inferExecutionItemStatus,
  lifecycleLabel,
  mapCollaboratorRole,
  mapTripLifecycle,
  resolveDayNumber,
  severityToRiskLevel,
  formatCalendarWeekday,
  formatCalendarDateRangeLabel,
  formatWeatherTempRange,
} from '../utils/mobile-execution.util';
import {
  readActivityContextFromTripMetadata,
} from '../../trips/guardian-decision-core/utils/execution-activity-context.util';
import {
  buildExecutionAlert,
  EXECUTION_ADJUSTMENT_QUEUE_SCHEMA_ID,
  EXECUTION_ALERTS_SCHEMA_ID,
  isScheduleTightnessIssue,
  prioritySortWeight,
  alertLevelSortWeight,
  projectConsumerToIntervention,
  resolveAlertLevel,
  resolveInterventionType,
} from '../utils/execution-intervention.projection.util';
import { InTripCommsPeersService } from '../../trips/in-trip-execution/services/in-trip-comms-peers.service';
import { InTripCommsService } from '../../trips/in-trip-execution/services/in-trip-comms.service';
import { InTripCommsSummaryService } from '../../trips/in-trip-execution/services/in-trip-comms-summary.service';
import { isInTripCommsEnabled } from '../../trips/in-trip-execution/utils/in-trip-comms-config.util';
import { extractActiveSosUserId } from '../../trips/utils/sos-attention.util';
import { projectActiveSosRead } from '../../trips/utils/sos-active.util';
import { ActiveRiskAggregationService } from '../../trips/execution-risk-center/services/active-risk-aggregation.service';
import { AttentionPrimarySsoCutoverService } from '../../trips/guardian-decision-core/attention/attention-primary-sso-cutover.service';
import { ExecutionRiskSummaryService } from '../../trips/execution-risk-center/services/execution-risk-summary.service';
import { ExecutionAdjustmentQueueProjectionService } from '../../trips/execution-risk-center/services/execution-adjustment-queue-projection.service';
import { ExecutionRiskShadowCompareService } from '../../trips/execution-risk-center/services/execution-risk-shadow-compare.service';
import {
  isExecutionRiskCanonicalEnabled,
  isExecutionRiskLegacyFallbackEnabled,
  isExecutionRiskShadowCompareEnabled,
  resolveExecutionRiskCutoverMode,
} from '../../trips/execution-risk-center/config/execution-risk-feature-flags.util';
import { buildExecutionAlertsFromActiveRisks } from '../utils/active-risk-alert.projection.util';
import {
  buildCurrentLocationName,
  extractRoadSegmentLabel,
  resolveActivityImageUrl,
  resolveDestinationShortLabel,
} from '../utils/current-activity-projection.util';
import { haversineDistanceMeters, isPlausibleCoord } from '../../trips/in-trip-execution/utils/comms-haversine.util';
import {
  formatTeamDistanceLabel,
  formatTeamDistanceMeters,
  projectIntercomMessage,
  type MobileIntercomMessagesResultDto,
  type MobileIntercomSummaryDto,
} from '../utils/mobile-intercom.projection.util';
import { resolveExecutionActionDeadlineFromTimeSlots } from '../../trips/execution-risk-center/utils/execution-action-deadline.util';

@Injectable()
export class MobileExecutionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly access: ConstraintSolverAccessService,
    private readonly snapshotAssembler: TripContextSnapshotAssemblerService,
    private readonly tripsService: TripsService,
    private readonly decisionQueue: ConsumerDecisionQueueService,
    private readonly decisionReadModel: UnifiedDecisionProblemReadModelService,
    private readonly tripToday: TripTodayService,
    private readonly environmentRadar: EnvironmentRadarService,
    private readonly executionAdvisory: ExecutionAdvisoryService,
    private readonly commsPeers: InTripCommsPeersService,
    private readonly comms: InTripCommsService,
    private readonly commsSummary: InTripCommsSummaryService,
    @Optional() private readonly activeRiskAggregation?: ActiveRiskAggregationService,
    @Optional() private readonly executionRiskSummary?: ExecutionRiskSummaryService,
    @Optional() private readonly adjustmentQueueProjection?: ExecutionAdjustmentQueueProjectionService,
    @Optional() private readonly shadowCompare?: ExecutionRiskShadowCompareService,
    @Optional() private readonly primarySsoCutover?: AttentionPrimarySsoCutoverService,
  ) {}

  async getContextSnapshot(tripId: string, userId: string): Promise<MobileContextSnapshotDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const [snapshot, state, queue, attention] = await Promise.all([
      this.snapshotAssembler.assemble(tripId).catch(() => null),
      this.tripsService.getTripState(tripId).catch(() => null),
      this.decisionQueue.getQueue(tripId, { hydrateRecommendations: false }).catch(() => null),
      this.tripsService.getAttentionQueue({ tripId, limit: 20, offset: 0 }).catch(() => null),
    ]);

    const members = await this.loadMembers(tripId);
    const lifecycle = mapTripLifecycle(trip.status);
    const contextVersion = computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    const progressItems = await this.loadTodayItems(tripId, trip.startDate, trip.endDate);
    const progressPercent = computeDayProgress(progressItems);

    const worldFacts = this.extractWorldFacts(snapshot);
    const decisions =
      queue?.items.map((item) => ({
        id: item.problemId,
        title: item.headline,
        status: 'pending' as const,
      })) ?? [];

    const notifications =
      attention?.items.map((item) => ({
        id: item.id,
        category: item.type?.includes('risk') || item.type?.includes('weather') ? 'risk' : 'info',
        title: item.title,
        createdAt: item.createdAt,
      })) ?? [];

    const activeSosRead = projectActiveSosRead(trip.metadata);

    return {
      trip: {
        id: trip.id,
        name: trip.name ?? '未命名行程',
        destination: trip.destination ?? '',
        startDate: DateTime.fromJSDate(trip.startDate).toISODate() ?? '',
        endDate: DateTime.fromJSDate(trip.endDate).toISODate() ?? '',
      },
      lifecycle,
      contextVersion,
      planVersion: snapshot?.bindings?.constraintsVersion ?? undefined,
      activePlan: snapshot?.effectivePlan?.hasEffectivePlan
        ? {
            id: snapshot.effectivePlan.versionId ?? `plan-${tripId}`,
            version: snapshot.bindings?.constraintsVersion ?? 1,
            title: trip.name ? `${trip.name} 执行方案` : '执行中路线',
          }
        : null,
      members,
      decisions,
      worldFacts,
      execution:
        lifecycle === 'traveling'
          ? {
              currentActivityID: state?.currentItemId ?? null,
              nextActivityID: state?.nextStop?.itemId ?? null,
              progressPercent,
              activeSOS: activeSosRead.active ? (activeSosRead.sos ?? null) : null,
            }
          : null,
      readiness: null,
      notifications,
      generatedAt: new Date().toISOString(),
    };
  }

  async getExecutionOverview(
    tripId: string,
    userId: string,
    opts?: { dayIndex?: number; lite?: boolean },
  ): Promise<MobileExecutionOverviewDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const lifecycle = mapTripLifecycle(trip.status);
    const isExecuting = lifecycle === 'traveling';
    const dayNumber = resolveDayNumber(trip.startDate, trip.endDate, DateTime.now(), opts?.dayIndex);
    const lite = opts?.lite === true;

    const [members, snapshot, state, today, queue, alertsPreview, advisory, adjustmentQueue] =
      await Promise.all([
      this.loadMembers(tripId),
      this.snapshotAssembler.assemble(tripId).catch(() => null),
      this.tripsService.getTripState(tripId).catch(() => null),
      isExecuting
        ? this.tripToday.getToday(tripId, userId).catch(() => null)
        : Promise.resolve(null),
      this.decisionQueue.getQueue(tripId, { hydrateRecommendations: false }).catch(() => null),
      !lite ? this.getExecutionAlerts(tripId, userId).catch(() => null) : Promise.resolve(null),
      isExecuting && !lite
        ? this.executionAdvisory.getAdvisory(tripId, userId).catch(() => null)
        : Promise.resolve(null),
      isExecuting
        ? this.getExecutionAdjustmentQueue(tripId, userId).catch(() => null)
        : Promise.resolve(null),
    ]);

    const contextVersion = computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    const todayItems = await this.loadTodayItems(tripId, trip.startDate, trip.endDate, dayNumber, {
      state,
    });
    const completedCount = todayItems.filter((i) => i.status === 'completed').length;
    const totalCount = todayItems.length;
    const progress = computeDayProgress(todayItems);

    const alertCount =
      (alertsPreview?.primaryRisk?.requiresImmediateAttention ? 1 : 0) +
      (alertsPreview?.alerts?.filter((a) => a.requiresImmediateAttention).length ?? 0);
    const adjustCount =
      isExecuting && adjustmentQueue != null
        ? adjustmentQueue.pendingCount
        : (queue?.openCount ?? 0);

    const executionScore = Math.round(
      (today?.todayReadiness && today.todayReadiness.source === 'readiness_engine'
        ? Number(today.todayReadiness.score) * 100
        : null) ?? Math.max(40, 100 - alertCount * 8 - adjustCount * 5),
    );

    const ai = advisory?.causalInsight;
    const verdict = advisory?.verdict;
    const nextStop = state?.nextStop;
    const currentTitle = nextStop?.placeName ?? '当前行程';
    const currentActivityExtras = await this.resolveCurrentActivityExtras({
      tripId,
      userId,
      state,
      nextStop,
      dayNumber,
      startDate: trip.startDate,
      endDate: trip.endDate,
    });

    return {
      tripName: trip.name ?? '未命名行程',
      dayLabel: `Day ${dayNumber}`,
      lifecycleLabel: lifecycleLabel(lifecycle),
      isExecuting,
      contextVersion,
      currentActivity: {
        title: currentTitle,
        subtitle: nextStop?.startTime ? `计划 ${formatTimeHHmm(nextStop.startTime)} 开始` : '今日行程',
        locationName: nextStop?.placeName ?? '—',
        meetingPoint: nextStop?.placeName ?? '—',
        meetingTime: nextStop?.startTime ? `${formatTimeHHmm(nextStop.startTime)} 集合` : '—',
        estimatedArrival: formatTimeHHmm(nextStop?.estimatedArrivalTime),
        remainingTime: formatRemainingMinutes(nextStop?.estimatedArrivalTime),
        progress,
        imageUrl: currentActivityExtras.imageUrl,
        currentLocationName: currentActivityExtras.currentLocationName,
      },
      metrics: [
        {
          id: 'time',
          icon: 'clock.fill',
          title: '时间',
          value: formatTimeHHmm(state?.now),
          detail: state?.timezone ?? '本地时间',
        },
        {
          id: 'weather',
          icon: 'cloud.sun.fill',
          title: '天气',
          value: today?.weather?.summary ?? '同步中',
          detail:
            today?.weather?.tempMin != null && today?.weather?.tempMax != null
              ? `${today.weather.tempMin}° ~ ${today.weather.tempMax}°`
              : '—',
        },
        {
          id: 'wind',
          icon: 'wind',
          title: '脆弱度',
          value: today?.vulnerability?.severity ?? '—',
          detail: `稳定 ${Math.round((today?.vulnerability?.stabilityScore ?? 0) * 100)}%`,
        },
        {
          id: 'signal',
          icon: 'antenna.radiowaves.left.and.right',
          title: '就绪',
          value:
            today?.todayReadiness?.source === 'readiness_engine'
              ? `${Math.round(Number(today.todayReadiness.score) * 100)}`
              : '—',
          detail: today?.todayReadiness?.source === 'readiness_engine' ? '今日可执行度' : '待计算',
        },
      ],
      team: {
        activeCount: members.length,
        totalCount: members.length,
        summary: `${members.length} 位成员同行`,
        note: today?.teamThermometer?.visible ? `团队温度 ${today.teamThermometer.level}` : undefined,
        trackingDeviceCount: 0,
        members: members.map((m) => ({
          id: m.id,
          name: m.displayName,
          role: m.role,
          avatarUrl: m.avatarUrl ?? null,
          status: 'online' as const,
        })),
      },
      statusRows: [
        {
          id: 'risk',
          icon: 'exclamationmark.triangle.fill',
          title: '执行预警',
          badgeCount: alertCount || undefined,
          detail: alertCount > 0 ? `${alertCount} 项需立即关注` : '暂无阻断性预警',
          style: 'risk',
        },
        {
          id: 'adjust',
          icon: 'arrow.triangle.branch',
          title: '待调整',
          badgeCount: adjustCount || undefined,
          detail: adjustCount > 0 ? `${adjustCount} 项待处理` : '计划稳定',
          style: 'adjustment',
        },
        {
          id: 'progress',
          icon: 'chart.line.uptrend.xyaxis',
          title: '今日进度',
          detail: `${completedCount}/${totalCount} 已完成`,
          progress: totalCount > 0 ? completedCount / totalCount : 0,
          style: 'progress',
        },
      ],
      quickActions: [
        { id: 'adjust-itinerary', icon: 'arrow.triangle.branch', title: '调整行程', isDestructive: false },
        { id: 'contact-leader', icon: 'person.2.fill', title: '联系领队', isDestructive: false },
        { id: 'send-notification', icon: 'bell.badge', title: '发通知', isDestructive: false },
        { id: 'log-event', icon: 'plus.circle', title: '记事件', isDestructive: false },
      ],
      executionScore,
      executionScoreLabel: executionScore >= 80 ? '良好' : executionScore >= 60 ? '一般' : '需关注',
      scoreBreakdown: [
        {
          id: 'readiness',
          label: '就绪度',
          value: `${executionScore}`,
          style: executionScore >= 75 ? 'success' : executionScore >= 55 ? 'warning' : 'neutral',
        },
        {
          id: 'risk',
          label: '预警',
          value: `${alertCount}`,
          style: alertCount > 0 ? 'warning' : 'success',
        },
        {
          id: 'decisions',
          label: '待处理',
          value: `${adjustCount}`,
          style: adjustCount > 0 ? 'warning' : 'success',
        },
      ],
      aiInsight: {
        observation: ai?.guardianHeadline ?? verdict?.headline ?? (lite ? '加载中…' : '暂无 AI 观察'),
        impact: ai?.causalStory?.assessment ?? verdict?.headline ?? '—',
        recommendation:
          advisory?.recommendations?.[0]?.label ?? (lite ? '请刷新完整总览' : '保持当前计划'),
        executable: advisory?.recommendations?.[0]?.actionType ?? 'keep',
      },
      meta: lite ? { partial: true, skippedSections: ['aiInsight'] } : undefined,
    };
  }

  async getTodayItinerary(
    tripId: string,
    userId: string,
    opts?: { dayIndex?: number },
  ): Promise<MobileTodayItineraryDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const dayNumber = resolveDayNumber(trip.startDate, trip.endDate, DateTime.now(), opts?.dayIndex);
    const contextVersion = (await this.getContextSnapshot(tripId, userId)).contextVersion;
    const items = await this.loadTodayItems(tripId, trip.startDate, trip.endDate, dayNumber);
    const activeItem = items.find((i) => i.status === 'inProgress') ?? items.find((i) => i.status === 'upcoming') ?? null;

    let warningTitle = '今日行程正常';
    let warningDetail = '暂无需要立即处理的预警';
    let warningImpact = '—';
    let warningRecommendation = '按当前计划执行';

    try {
      const events = await this.environmentRadar.listOpenEvents(tripId, userId);
      const top = events.find((e) => e.severity === 'red' || e.severity === 'yellow');
      if (top) {
        warningTitle = top.description?.slice(0, 40) ?? '环境预警';
        warningDetail = top.description ?? warningDetail;
        warningImpact = `${top.type} · ${top.severity}`;
        warningRecommendation = '查看替代方案或调整出发时间';
      }
    } catch {
      // environment module optional
    }

    return {
      dayTitle: `Day ${dayNumber} 日程执行`,
      contextVersion,
      warningTitle,
      warningDetail,
      warningImpact,
      warningRecommendation,
      items,
      activeItem,
      participantCount: (await this.loadMembers(tripId)).length,
      merchantName: activeItem?.merchantName ?? '',
      confirmationCode: activeItem?.confirmationCode ?? '',
    };
  }

  /** P1 — 行程日历（执行期按天总览；切天复用 today-itinerary?dayIndex=） */
  async getItineraryCalendar(
    tripId: string,
    userId: string,
  ): Promise<MobileItineraryCalendarDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const contextVersion = (await this.getContextSnapshot(tripId, userId)).contextVersion;
    const now = DateTime.now().startOf('day');

    const days = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      include: {
        ItineraryItem: {
          orderBy: [{ order: 'asc' }, { startTime: 'asc' }],
          include: { Place: { select: { nameCN: true, nameEN: true } } },
        },
      },
    });

    let todayWeather: {
      tempMin: number | null;
      tempMax: number | null;
    } | null = null;
    try {
      const today = await this.tripToday.getToday(tripId, userId);
      todayWeather = today.weather;
    } catch {
      // optional — planning / pre-travel may not have today dashboard
    }

    const currentDayIndex = resolveDayNumber(trip.startDate, trip.endDate, DateTime.now());
    const tripMeta = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (tripMeta?.metadata as Record<string, unknown>) ?? {};
    const dayThemes =
      meta.dayThemes && typeof meta.dayThemes === 'object' && !Array.isArray(meta.dayThemes)
        ? (meta.dayThemes as Record<string | number, string>)
        : {};
    const mobileExecution =
      (meta.mobileExecution as {
        completedActivities?: Record<string, unknown>;
      }) ?? {};
    const completedIds = new Set(Object.keys(mobileExecution.completedActivities ?? {}));

    type DayRow = {
      dayIndex: number;
      date: DateTime;
      activityCount: number;
      locationSummary: string;
      itemIds: string[];
      endTimes: Array<Date | null>;
    };

    let dayRows: DayRow[];
    if (days.length > 0) {
      dayRows = days.map((day, idx) => {
        const dayIndex = idx + 1;
        const placeNames = day.ItineraryItem.map(
          (i) => i.Place?.nameCN ?? i.Place?.nameEN ?? i.note,
        ).filter((n): n is string => !!n?.trim());
        const uniquePlaces = [...new Set(placeNames)].slice(0, 3);
        const theme = dayThemes[dayIndex] ?? dayThemes[String(dayIndex)] ?? '';
        return {
          dayIndex,
          date: DateTime.fromJSDate(day.date).startOf('day'),
          activityCount: day.ItineraryItem.length,
          locationSummary:
            uniquePlaces.length > 0
              ? uniquePlaces.join(' · ')
              : theme.trim() || `Day ${dayIndex}`,
          itemIds: day.ItineraryItem.map((i) => i.id),
          endTimes: day.ItineraryItem.map((i) => i.endTime),
        };
      });
    } else {
      // TripDay 尚未物化时，按起止日合成空天，保证日历页可渲染
      const start = DateTime.fromJSDate(trip.startDate).startOf('day');
      const end = DateTime.fromJSDate(trip.endDate).startOf('day');
      const total = Math.max(1, Math.floor(end.diff(start, 'days').days) + 1);
      dayRows = Array.from({ length: total }, (_, idx) => {
        const dayIndex = idx + 1;
        const theme = dayThemes[dayIndex] ?? dayThemes[String(dayIndex)] ?? '';
        return {
          dayIndex,
          date: start.plus({ days: idx }),
          activityCount: 0,
          locationSummary: theme.trim() || `Day ${dayIndex}`,
          itemIds: [],
          endTimes: [],
        };
      });
    }

    const resultDays: MobileItineraryCalendarDayDto[] = dayRows.map((row) => {
      let status: MobileItineraryCalendarDayDto['status'] = 'upcoming';
      if (row.dayIndex < currentDayIndex || row.date < now) {
        const allDone =
          row.itemIds.length > 0 &&
          row.itemIds.every(
            (id, i) =>
              completedIds.has(id) ||
              (row.endTimes[i] != null && DateTime.fromJSDate(row.endTimes[i]!) < DateTime.now()),
          );
        status = allDone || row.dayIndex < currentDayIndex ? 'completed' : 'executing';
      } else if (row.dayIndex === currentDayIndex) {
        status = 'executing';
      }

      const tempRange = formatWeatherTempRange(todayWeather?.tempMin, todayWeather?.tempMax);
      const weather =
        row.dayIndex === currentDayIndex && tempRange
          ? { tempRange, wind: '' }
          : undefined;

      return {
        dayIndex: row.dayIndex,
        date: row.date.toISODate() ?? row.date.toFormat('yyyy-MM-dd'),
        weekday: formatCalendarWeekday(row.date),
        locationSummary: row.locationSummary,
        activityCount: row.activityCount,
        status,
        ...(weather ? { weather } : {}),
      };
    });

    const totalActivities = resultDays.reduce((sum, d) => sum + d.activityCount, 0);
    const tripTitle = trip.name?.trim() || '未命名行程';

    return {
      contextVersion,
      tripTitle,
      dateRangeLabel: formatCalendarDateRangeLabel({
        totalDays: resultDays.length,
        destination: trip.destination,
        startDate: trip.startDate,
      }),
      currentDayIndex,
      days: resultDays,
      overview: {
        totalDays: resultDays.length,
        totalActivities,
      },
    };
  }

  /** P1 — 活动执行详情 */
  async getActivityExecutionDetail(
    tripId: string,
    userId: string,
    activityId: string,
  ): Promise<MobileActivityExecutionDetailDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const contextVersion = (await this.getContextSnapshot(tripId, userId)).contextVersion;

    const item = await this.prisma.itineraryItem.findFirst({
      where: { id: activityId, TripDay: { tripId } },
      include: {
        Place: true,
        TripDay: true,
      },
    });
    if (!item) {
      throw new NotFoundException(`活动 ${activityId} 不存在或不属于该行程`);
    }

    const allDays = await this.prisma.tripDay.findMany({
      where: { tripId },
      orderBy: { date: 'asc' },
      select: { id: true },
    });
    const dayIndex = Math.max(1, allDays.findIndex((d) => d.id === item.tripDayId) + 1);

    const tripRow = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (tripRow?.metadata as Record<string, unknown>) ?? {};
    const mobileExecution =
      (meta.mobileExecution as {
        completedActivities?: Record<string, unknown>;
        activityOverrides?: Record<
          string,
          { title?: string; notes?: string; plannedDepartAt?: string }
        >;
      }) ?? {};
    const override = mobileExecution.activityOverrides?.[activityId];
    const activityCtx = readActivityContextFromTripMetadata(meta, activityId);
    const delayMinutes = typeof meta.inTripDelayMinutes === 'number' ? meta.inTripDelayMinutes : 0;

    const state = await this.tripsService.getTripState(tripId).catch(() => null);
    const isCurrent = state?.currentItemId === activityId;
    const isManuallyCompleted = !!mobileExecution.completedActivities?.[activityId];
    const status = isManuallyCompleted
      ? ('completed' as const)
      : inferExecutionItemStatus({
          startTime: item.startTime,
          endTime: item.endTime,
          now: DateTime.now(),
          isCurrent,
          isDelayed: delayMinutes > 15 && isCurrent,
        });

    const placeMeta = (item.Place?.metadata as Record<string, unknown>) ?? {};
    const lat =
      (placeMeta.lat as number | undefined) ??
      (placeMeta.latitude as number | undefined) ??
      null;
    const lng =
      (placeMeta.lng as number | undefined) ??
      (placeMeta.longitude as number | undefined) ??
      null;

    const title =
      override?.title ??
      item.Place?.nameCN ??
      item.Place?.nameEN ??
      item.note ??
      '行程项';
    const merchantName = item.Place?.nameEN ?? item.Place?.nameCN ?? '';
    const members = await this.loadMembers(tripId);

    return {
      contextVersion,
      id: item.id,
      title,
      time: formatTimeHHmm(item.startTime),
      endTime: item.endTime ? formatTimeHHmm(item.endTime) : '',
      location: title,
      status,
      merchantName: merchantName || '',
      confirmationCode: item.bookingConfirmation ?? '',
      notes: override?.notes ?? item.note ?? '',
      plannedDepartAt:
        override?.plannedDepartAt ??
        activityCtx.plannedDepartAt ??
        item.startTime?.toISOString() ??
        null,
      experienceType: item.type ?? '',
      duration: formatDurationMinutes(item.startTime, item.endTime) ?? '',
      dayIndex,
      members: members.map((m) => ({
        id: m.id,
        name: m.displayName,
        role: m.role,
      })),
      navigationPoint:
        lat != null && lng != null
          ? { lat, lng, label: title }
          : null,
      bookingStatus: item.bookingStatus ?? '',
      bookingUrl: item.bookingUrl ?? '',
    };
  }

  async getLiveRoute(tripId: string, userId: string): Promise<MobileLiveRouteDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const contextVersion = (await this.getContextSnapshot(tripId, userId)).contextVersion;
    const state = await this.tripsService.getTripState(tripId);
    const nextStop = state.nextStop;
    const members = await this.loadMembers(tripId);

    const destLat = nextStop?.Place?.latitude ?? nextStop?.latitude ?? null;
    const destLng = nextStop?.Place?.longitude ?? nextStop?.longitude ?? null;

    const markers: MobileLiveRouteDto['map']['markers'] = [];
    if (destLat != null && destLng != null) {
      markers.push({
        id: 'destination',
        type: 'destination',
        lat: Number(destLat),
        lng: Number(destLng),
        label: nextStop?.placeName ?? '下一站',
      });
    }

    const dayItems = await this.loadTodayRawItems(tripId, trip.startDate, trip.endDate);
    const coords: Array<[number, number]> = [];
    for (const item of dayItems) {
      const lat = item.placeLat;
      const lng = item.placeLng;
      if (lat != null && lng != null) {
        coords.push([lat, lng]);
        markers.push({
          id: `poi-${item.id}`,
          type: 'meeting',
          lat,
          lng,
          label: item.title,
        });
      }
    }

    let aiAlertTitle = '路况正常';
    let aiAlertDetail = '暂无显著道路或天气影响';
    let aiRecommendation = '按导航前往下一站';
    try {
      const events = await this.environmentRadar.listOpenEvents(tripId, userId);
      const top = events[0];
      if (top) {
        aiAlertTitle = top.description?.slice(0, 40) ?? aiAlertTitle;
        aiAlertDetail = top.description ?? aiAlertDetail;
        aiRecommendation = '关注环境预警并预留缓冲时间';
      }
    } catch {
      // optional
    }

    return {
      contextVersion,
      navInstruction: nextStop?.placeName ? `前往 ${nextStop.placeName}` : '查看今日路线',
      navDistance: '—',
      navNext: nextStop?.placeName ?? '—',
      eta: formatTimeHHmm(nextStop?.estimatedArrivalTime ?? state.eta),
      remaining: formatRemainingMinutes(nextStop?.estimatedArrivalTime ?? state.eta),
      activityTitle: nextStop?.placeName ?? '今日活动',
      distanceToDestination: '—',
      progress: computeDayProgress(await this.loadTodayItems(tripId, trip.startDate, trip.endDate)),
      teamSummary: `${members.length} 位成员`,
      teamNote: '位置共享需开启对讲模块',
      teamMembers: members.map((m) => ({
        id: m.id,
        name: m.displayName,
        status: m.role === 'leader' ? '同行中' : '同行中',
      })),
      aiAlertTitle,
      aiAlertDetail,
      aiRecommendation,
      map: {
        coordinateOrder: 'latLng',
        polylines:
          coords.length >= 2
            ? [{ id: 'today-route', coordinates: coords, style: 'primary' }]
            : [],
        markers,
        navigationSteps: nextStop?.placeName
          ? [
              {
                instruction: `前往 ${nextStop.placeName}`,
                distance: '—',
                maneuver: 'straight',
              },
            ]
          : [],
      },
    };
  }

  /** 第一层：执行预警 — 统一 Execution Risk Center 投影（legacy 回退保留） */
  async getExecutionAlerts(tripId: string, userId: string): Promise<ExecutionAlertsDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const contextVersion = computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    const cutoverMode = resolveExecutionRiskCutoverMode();

    if (cutoverMode === 'SHADOW_COMPARE') {
      const [legacy, canonical] = await Promise.all([
        this.getExecutionAlertsLegacy(tripId, userId, trip, contextVersion).catch(() => null),
        this.buildCanonicalExecutionAlerts(tripId, userId, contextVersion).catch(() => null),
      ]);

      if (this.shadowCompare?.isEnabled()) {
        this.shadowCompare.compareForTrip(tripId, userId).catch(() => undefined);
      }

      return legacy ?? canonical ?? this.emptyExecutionAlerts(tripId, contextVersion);
    }

    if (cutoverMode === 'CANONICAL' && this.activeRiskAggregation) {
      try {
        return await this.buildCanonicalExecutionAlerts(tripId, userId, contextVersion);
      } catch {
        if (!isExecutionRiskLegacyFallbackEnabled()) throw new NotFoundException('执行预警不可用');
      }
    }

    if (this.activeRiskAggregation && !isExecutionRiskCanonicalEnabled()) {
      try {
        const canonical = await this.buildCanonicalExecutionAlerts(tripId, userId, contextVersion);
        if (isExecutionRiskShadowCompareEnabled() && this.shadowCompare) {
          this.shadowCompare.compareForTrip(tripId, userId).catch(() => undefined);
        }
        return canonical;
      } catch {
        // fall through to legacy aggregation
      }
    }

    return this.getExecutionAlertsLegacy(tripId, userId, trip, contextVersion);
  }

  private async buildCanonicalExecutionAlerts(
    tripId: string,
    userId: string,
    contextVersion: number,
  ): Promise<ExecutionAlertsDto> {
    if (!this.activeRiskAggregation) {
      throw new NotFoundException('Execution Risk Center unavailable');
    }

    const [risks, summary, advisory, cutoverPlan] = await Promise.all([
      this.activeRiskAggregation.listRisks(tripId, userId),
      this.executionRiskSummary
        ? this.executionRiskSummary.getSummary(tripId, userId).catch(() => null)
        : Promise.resolve(null),
      this.executionAdvisory.getAdvisory(tripId, userId).catch(() => null),
      this.primarySsoCutover?.loadCutoverPlan(tripId).catch(() => null) ?? Promise.resolve(null),
    ]);
    const topRecommendation =
      advisory?.recommendations.find((r) => r.isRecommended) ??
      advisory?.recommendations[0];
    return buildExecutionAlertsFromActiveRisks({
      tripId,
      contextVersion,
      risks,
      summaryHeadline: summary?.recommendation?.headline,
      summaryDetail:
        advisory?.causalInsight?.causalStory?.assessment ??
        summary?.recommendation?.explanation ??
        summary?.summary ??
        undefined,
      summaryRecommendedAction:
        topRecommendation?.label ?? summary?.recommendation?.recommendedAction,
      causalInsight: advisory?.causalInsight,
      evidenceIds: risks.flatMap((r) => r.evidenceRefs.map((e) => e.id)),
      cutoverPlan,
    });
  }

  private emptyExecutionAlerts(tripId: string, contextVersion: number): ExecutionAlertsDto {
    return {
      schemaId: EXECUTION_ALERTS_SCHEMA_ID,
      tripId,
      contextVersion,
      projectionSource: 'legacy',
      alerts: [],
      aiRecommendation: {
        title: '建议',
        detail: '可继续按当前计划执行',
        evidenceIds: [],
      },
    };
  }

  /** @deprecated 内部 legacy 聚合 — Mobile BFF 回退路径 */
  private async getExecutionAlertsLegacy(
    tripId: string,
    userId: string,
    trip: Awaited<ReturnType<ConstraintSolverAccessService['assertTripMember']>>,
    contextVersion: number,
  ): Promise<ExecutionAlertsDto> {
    const [attention, envEvents, advisory, listView] = await Promise.all([
      this.tripsService.getAttentionQueue({ tripId, limit: 50, offset: 0 }).catch(() => null),
      this.environmentRadar.listOpenEvents(tripId, userId).catch(() => []),
      this.executionAdvisory.getAdvisory(tripId, userId).catch(() => null),
      isDecisionGatewayUnifiedEnabled()
        ? this.decisionReadModel.listProblems(tripId, { queueOnly: true }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const alerts = [
      ...(listView?.items ?? [])
        .filter((item) => !['RESOLVED', 'DISMISSED'].includes(item.workflowStatus))
        .filter((item) => !isScheduleTightnessIssue(item))
        .filter((item) => item.enforcement === 'BLOCK' || item.enforcement === 'REQUIRE_ADJUSTMENT')
        .map((item) => {
          const type = resolveInterventionType(item, {
            problemId: item.problemId,
            headline: item.title,
            explanation: item.summary,
            impact: item.summary,
            severity: item.enforcement === 'BLOCK' ? 'BLOCK' : 'CONFLICT',
            actions: {
              acceptRecommended: { enabled: false },
              keepOriginal: { enabled: false },
              viewAlternatives: { enabled: false, count: 0 },
              defer: { enabled: false },
            },
            schemaId: 'tripnara.consumer_decision_item@v1',
          });
          return buildExecutionAlert({
            id: item.problemId,
            level: resolveAlertLevel({
              enforcement: item.enforcement,
              semanticKey: item.semanticKey,
              type,
            }),
            title: item.title,
            reason: item.summary,
            impact: item.legacySummary?.affectedScopeSummary ?? item.summary,
            affectedActivities:
              item.impactScopeView?.arrangements?.map((a) => a.label) ??
              (item.legacySummary?.affectedScopeSummary
                ? [item.legacySummary.affectedScopeSummary]
                : []),
            evidenceRefs: item.detectors.flatMap((d) => d.sourceRefIds ?? []),
            observedAt: listView?.generatedAt ?? new Date().toISOString(),
          });
        }),
      ...(attention?.items ?? [])
        .filter((item) => severityToRiskLevel(item.severity) === 'high')
        .map((item) =>
          buildExecutionAlert({
            id: item.id,
            level: 'AT_RISK',
            title: item.title,
            reason: item.description ?? item.title,
            impact: item.description ?? '—',
            affectedActivities: item.metadata?.day != null ? [`Day ${item.metadata.day}`] : [],
            evidenceRefs: item.metadata?.evidenceIds ?? [],
            observedAt: item.createdAt,
          }),
        ),
      ...envEvents
        .filter((ev) => ev.severity === 'red' || ev.severity === 'yellow')
        .map((ev) =>
          buildExecutionAlert({
            id: ev.id,
            level: resolveAlertLevel({ envSeverity: ev.severity, semanticKey: ev.type }),
            title: ev.description?.slice(0, 80) ?? '环境预警',
            reason: ev.description ?? '—',
            impact: `${ev.type} · ${ev.severity}`,
            affectedActivities: [],
            evidenceRefs: [],
            observedAt: ev.detectedAt,
          }),
        ),
    ].sort((a, b) => alertLevelSortWeight(a.level) - alertLevelSortWeight(b.level));

    const top = alerts[0];
    const ai = advisory?.causalInsight;
    const verdict = advisory?.verdict;

    return {
      schemaId: EXECUTION_ALERTS_SCHEMA_ID,
      tripId,
      contextVersion,
      projectionSource: 'legacy',
      banner:
        top && (top.level === 'STOP' || top.level === 'REPLAN_REQUIRED')
          ? {
              level: top.level,
              title:
                top.level === 'STOP' ? '停止执行 / 必须重新规划' : '需要重新规划部分行程',
              detail: top.reason,
            }
          : undefined,
      alerts,
      aiRecommendation: {
        title: '建议',
        detail:
          ai?.guardianHeadline ??
          verdict?.headline ??
          (alerts.length > 0 ? '优先处理执行预警后再继续行程' : '可继续按当前计划执行'),
        evidenceIds: alerts.flatMap((a) => a.evidenceRefs),
      },
    };
  }

  /** @deprecated 别名 — 请使用 getExecutionAlerts */
  async getRiskAlerts(tripId: string, userId: string): Promise<ExecutionAlertsDto> {
    return this.getExecutionAlerts(tripId, userId);
  }

  /** 第二层：待调整事项 — ExecutionAdjustmentQueue */
  async getExecutionAdjustmentQueue(
    tripId: string,
    userId: string,
  ): Promise<ExecutionAdjustmentQueueDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const snapshot = await this.snapshotAssembler.assemble(tripId).catch(() => null);
    const contextVersion = computeMobileContextVersion({
      constraintsVersion: snapshot?.bindings?.constraintsVersion ?? 0,
      tripUpdatedAt: trip.updatedAt,
      effectivePlanVersionId: snapshot?.effectivePlan?.versionId,
    });

    const members = await this.loadMembers(tripId);
    const memberNamesById = new Map(members.map((m) => [m.id, m.displayName]));
    const todayItems = await this.loadTodayItems(tripId, trip.startDate, trip.endDate);
    const activityTitleById = new Map(todayItems.map((i) => [i.id, i.title]));
    const nextDeadline = this.resolveNextActivityDeadline(todayItems);

    if (this.adjustmentQueueProjection) {
      try {
        const projected = await this.adjustmentQueueProjection.getAdjustmentQueue(
          tripId,
          userId,
          { memberNamesById, activityTitleById, actionDeadline: nextDeadline },
        );
        return { ...projected, contextVersion };
      } catch {
        // fall through to legacy
      }
    }

    return this.getExecutionAdjustmentQueueLegacy(
      tripId,
      userId,
      contextVersion,
      memberNamesById,
      activityTitleById,
      nextDeadline,
    );
  }

  private async getExecutionAdjustmentQueueLegacy(
    tripId: string,
    userId: string,
    contextVersion: number,
    memberNamesById: Map<string, string>,
    activityTitleById: Map<string, string>,
    nextDeadline?: string,
  ): Promise<ExecutionAdjustmentQueueDto> {
    const [queue, listView] = await Promise.all([
      this.decisionQueue.getQueue(tripId, { hydrateRecommendations: true }),
      isDecisionGatewayUnifiedEnabled()
        ? this.decisionReadModel.listProblems(tripId, { queueOnly: true }).catch(() => null)
        : Promise.resolve(null),
    ]);

    const listById = new Map<string, UnifiedDecisionProblemListItem>(
      (listView?.items ?? []).map((item) => [item.problemId, item]),
    );

    const items = queue.items
      .map((consumer) =>
        projectConsumerToIntervention({
          consumer,
          listItem: listById.get(consumer.problemId),
          tripId,
          memberNamesById,
          activityTitleById,
          actionDeadline: nextDeadline,
        }),
      )
      .sort((a, b) => prioritySortWeight(a.priority) - prioritySortWeight(b.priority));

    const countsByType: Record<ExecutionInterventionType, number> = {
      SAFETY_INTERVENTION: 0,
      DYNAMIC_REPLAN: 0,
      TEAM_COORDINATION: 0,
      EXECUTION_PREPARATION: 0,
    };
    for (const item of items) {
      countsByType[item.type] += 1;
    }

    return {
      schemaId: EXECUTION_ADJUSTMENT_QUEUE_SCHEMA_ID,
      tripId,
      contextVersion,
      projectionSource: 'legacy',
      pendingCount: queue.openCount,
      criticalCount: items.filter((i) => i.priority === 'CRITICAL').length,
      highPriorityCount: items.filter((i) => i.priority === 'HIGH' || i.priority === 'CRITICAL')
        .length,
      headline: queue.headline,
      items,
      countsByType,
    };
  }

  /** @deprecated 别名 — 请使用 getExecutionAdjustmentQueue */
  async getPendingAdjustments(tripId: string, userId: string): Promise<ExecutionAdjustmentQueueDto> {
    return this.getExecutionAdjustmentQueue(tripId, userId);
  }

  /** 单个调整项的完整因果链回放（技术 trace + 叙事投影） */
  async getInterventionCausalTrace(tripId: string, userId: string, interventionId: string) {
    await this.access.assertTripMember(tripId, userId);
    return this.decisionReadModel.getCausalTraceReplay(tripId, interventionId);
  }

  private resolveNextActivityDeadline(
    todayItems: MobileTodayItineraryItemDto[],
  ): string | undefined {
    return resolveExecutionActionDeadlineFromTimeSlots(todayItems);
  }

  async getTeamStatus(tripId: string, userId: string): Promise<MobileTeamStatusDto> {
    await this.access.assertTripMember(tripId, userId);
    const [members, tripRow] = await Promise.all([
      this.loadMembers(tripId),
      this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      }),
    ]);
    const tripMeta = (tripRow?.metadata as Record<string, unknown>) ?? {};
    const mobileExecution =
      (tripMeta.mobileExecution as { memberPresence?: Record<string, { batteryPercent?: number }> }) ?? {};
    const memberPresence = mobileExecution.memberPresence ?? {};

    const activeSosUserId = extractActiveSosUserId(tripRow?.metadata);
    const state = await this.tripsService.getTripState(tripId).catch(() => null);
    const meetingLat =
      state?.nextStop?.Place?.latitude ?? state?.nextStop?.latitude ?? null;
    const meetingLng =
      state?.nextStop?.Place?.longitude ?? state?.nextStop?.longitude ?? null;

    let peersToMeeting: Awaited<ReturnType<InTripCommsPeersService['getPeers']>> | null = null;
    let peersToSelf: Awaited<ReturnType<InTripCommsPeersService['getPeers']>> | null = null;
    if (isInTripCommsEnabled()) {
      try {
        peersToSelf = await this.commsPeers.getPeers(tripId, userId, {});
      } catch {
        // 无当前用户位置或 comms 阶段未就绪 — 相对距离降级为 null
      }
      try {
        const meetingRef =
          meetingLat != null && meetingLng != null
            ? { refLat: Number(meetingLat), refLng: Number(meetingLng) }
            : {};
        peersToMeeting = await this.commsPeers.getPeers(tripId, userId, meetingRef);
      } catch {
        // 无集合点参照 — distanceToMeeting 降级为 null
      }
    }

    const meetingPeerMap = new Map((peersToMeeting?.peers ?? []).map((p) => [p.userId, p]));
    const selfPeerMap = new Map((peersToSelf?.peers ?? []).map((p) => [p.userId, p]));
    const selfReference = peersToSelf?.referencePoint;

    return {
      members: members.map((m) => {
        const meetingPeer = meetingPeerMap.get(m.id);
        const selfPeer = selfPeerMap.get(m.id);
        const connection = meetingPeer?.connection ?? selfPeer?.connection ?? 'offline';
        const status =
          m.id === activeSosUserId
            ? ('warning' as const)
            : connection === 'online'
              ? ('online' as const)
              : connection === 'offline'
                ? ('offline' as const)
                : ('warning' as const);

        const meetingDistanceMeters = meetingPeer?.distanceMeters ?? null;
        let currentUserDistanceMeters: number | null =
          m.id === userId ? null : (selfPeer?.distanceMeters ?? null);

        if (
          currentUserDistanceMeters == null &&
          m.id !== userId &&
          selfReference &&
          selfPeer?.lastLocation
        ) {
          currentUserDistanceMeters = haversineDistanceMeters(
            selfReference.lat,
            selfReference.lng,
            selfPeer.lastLocation.lat,
            selfPeer.lastLocation.lng,
          );
        }

        return {
          id: m.id,
          name: m.displayName,
          role: m.role,
          status,
          avatarUrl: m.avatarUrl ?? null,
          batteryPercent: memberPresence[m.id]?.batteryPercent ?? undefined,
          distanceToMeeting: formatTeamDistanceLabel(meetingDistanceMeters),
          distanceToCurrentUserMeters: formatTeamDistanceMeters(currentUserDistanceMeters),
          distanceToCurrentUserLabel: formatTeamDistanceLabel(currentUserDistanceMeters),
          lastUpdateAt: meetingPeer?.lastSeenAt ?? selfPeer?.lastSeenAt ?? new Date().toISOString(),
        };
      }),
      groups: state?.nextStop?.placeName
        ? [
            {
              name: '当前集合',
              meetingPoint: state.nextStop.placeName,
              memberIds: members.map((m) => m.id),
            },
          ]
        : undefined,
    };
  }

  async getIntercomMessages(
    tripId: string,
    userId: string,
    query: { limit?: number; before?: string; after?: string },
  ): Promise<MobileIntercomMessagesResultDto> {
    await this.access.assertTripMember(tripId, userId);
    if (!isInTripCommsEnabled()) {
      return { messages: [], hasMore: false };
    }

    const result = await this.comms.listMessages(tripId, userId, {
      limit: query.limit,
      before: query.before,
      since: query.after,
    });

    const members = await this.loadMembers(tripId);
    const avatarByUserId = new Map(members.map((m) => [m.id, m.avatarUrl]));

    return {
      messages: result.messages.map((msg) =>
        projectIntercomMessage(msg, userId, avatarByUserId),
      ),
      hasMore: result.hasMore,
      nextCursor: result.nextBefore ?? undefined,
    };
  }

  async getIntercomVoiceAudioUrl(tripId: string, userId: string, messageId: string) {
    await this.access.assertTripMember(tripId, userId);
    return this.comms.getVoiceAudioSignedUrl(tripId, userId, messageId);
  }

  async getIntercomSummary(tripId: string, userId: string): Promise<MobileIntercomSummaryDto> {
    await this.access.assertTripMember(tripId, userId);
    if (!isInTripCommsEnabled()) {
      return {
        status: 'offline',
        updatedAt: new Date().toISOString(),
        bullets: [],
      };
    }

    try {
      const result = await this.commsSummary.getSummary(tripId, userId, { maxBullets: 5 });
      const status: MobileIntercomSummaryDto['status'] =
        result.bullets.length > 0
          ? 'ready'
          : result.degraded && result.reason !== 'SUMMARY_PROVIDER_UNAVAILABLE'
            ? 'stale'
            : 'stale';
      return {
        status,
        updatedAt: result.generatedAt,
        bullets: result.bullets,
      };
    } catch {
      return {
        status: 'offline',
        updatedAt: new Date().toISOString(),
        bullets: [],
      };
    }
  }

  async getRoadConditions(tripId: string, userId: string): Promise<MobileRoadConditionsDto> {
    await this.access.assertTripMember(tripId, userId);
    const contextVersion = (await this.getContextSnapshot(tripId, userId)).contextVersion;

    const [envEvents, advisory, snapshot] = await Promise.all([
      this.environmentRadar.listOpenEvents(tripId, userId).catch(() => []),
      this.executionAdvisory.getAdvisory(tripId, userId).catch(() => null),
      this.snapshotAssembler.assemble(tripId).catch(() => null),
    ]);

    const topEvent = envEvents[0];
    const ai = advisory?.causalInsight;
    const verdict = advisory?.verdict;

    const alertTitle =
      topEvent?.description?.slice(0, 60) ??
      ai?.guardianHeadline ??
      verdict?.headline ??
      '路况正常';
    const alertDetail =
      topEvent?.description ??
      ai?.causalStory?.assessment ??
      verdict?.headline ??
      '暂无显著道路或天气影响';

    const timeline = envEvents.map((ev) => ({
      time: formatTimeHHmm(ev.detectedAt),
      event: ev.description?.slice(0, 120) ?? ev.type,
      severity: ev.severity === 'red' ? 'high' : ev.severity === 'yellow' ? 'medium' : 'low',
    }));

    const ontology = snapshot?.tripOntologyFacts ?? [];
    const evidence = ontology.slice(0, 10).map((f) => ({
      id: f.factId,
      source: f.predicate ?? 'world-fact',
      detail: typeof f.value === 'string' ? f.value : JSON.stringify(f.value).slice(0, 200),
      updatedAt: new Date().toISOString(),
      publisher: f.predicate ?? 'TripNara',
      title: f.predicate ?? 'World Fact',
      publishedAt: new Date().toISOString(),
      retrievedAt: new Date().toISOString(),
    }));

    if (timeline.length === 0 && alertTitle !== '路况正常') {
      timeline.push({
        time: formatTimeHHmm(new Date()),
        event: alertDetail.slice(0, 120),
        severity: 'medium',
      });
    }

    return {
      contextVersion,
      alertTitle,
      alertDetail,
      timeline,
      evidence,
    };
  }

  async getMeetingPoint(
    tripId: string,
    userId: string,
    pointId: string,
  ): Promise<MobileMeetingPointDto> {
    const trip = await this.access.assertTripMember(tripId, userId);
    const contextVersion = (await this.getContextSnapshot(tripId, userId)).contextVersion;
    const state = await this.tripsService.getTripState(tripId);
    const members = await this.loadMembers(tripId);

    let targetItemId = pointId;
    if (pointId === 'current' || pointId === 'next') {
      targetItemId = state.nextStop?.itemId ?? state.currentItemId ?? pointId;
    }

    const rawItems = await this.loadTodayRawItems(tripId, trip.startDate, trip.endDate);

    let item =
      rawItems.find((i) => i.id === targetItemId) ??
      (state.nextStop?.itemId
        ? rawItems.find((i) => i.id === state.nextStop!.itemId)
        : undefined);

    const lat =
      item?.placeLat ??
      (state.nextStop?.Place?.latitude != null ? Number(state.nextStop.Place.latitude) : null) ??
      (state.nextStop?.latitude != null ? Number(state.nextStop.latitude) : null);
    const lng =
      item?.placeLng ??
      (state.nextStop?.Place?.longitude != null ? Number(state.nextStop.Place.longitude) : null) ??
      (state.nextStop?.longitude != null ? Number(state.nextStop.longitude) : null);

    if (lat == null || lng == null) {
      throw new NotFoundException(`集合点 ${pointId} 无有效坐标`);
    }

    const name = item?.title ?? state.nextStop?.placeName ?? '集合点';
    const advisedArrivalTime = state.nextStop?.startTime
      ? formatTimeHHmm(state.nextStop.startTime)
      : item?.startTime
        ? formatTimeHHmm(item.startTime)
        : '—';

    let peersResult: Awaited<ReturnType<InTripCommsPeersService['getPeers']>> | null = null;
    try {
      peersResult = await this.commsPeers.getPeers(tripId, userId, {
        refLat: lat,
        refLng: lng,
      });
    } catch {
      // comms optional
    }

    const peerMap = new Map((peersResult?.peers ?? []).map((p) => [p.userId, p]));
    const syncCount = (peersResult?.peers ?? []).filter(
      (p) => p.connection === 'online' && p.lastLocation,
    ).length;

    const participants = members.map((m) => {
      const peer = peerMap.get(m.id);
      const distanceMeters = peer?.distanceMeters;
      let status = '待出发';
      if (peer?.connection === 'online') {
        if (distanceMeters != null && distanceMeters <= 200) status = '已到达';
        else if (distanceMeters != null && distanceMeters <= 2000) status = '接近中';
        else status = '途中';
      } else {
        status = '离线';
      }
      return {
        memberId: m.id,
        name: m.displayName,
        eta:
          distanceMeters != null && distanceMeters > 0
            ? distanceMeters >= 1000
              ? `约 ${Math.ceil(distanceMeters / 1000 / 0.5)} 分钟`
              : `约 ${Math.ceil(distanceMeters / 80)} 分钟`
            : '—',
        status,
      };
    });

    return {
      contextVersion,
      id: item?.id ?? pointId,
      name,
      lat,
      lng,
      advisedArrivalTime,
      description: item?.meta?.merchantName
        ? `${name} · ${item.meta.merchantName}`
        : `在 ${name} 集合`,
      instructions: [
        advisedArrivalTime !== '—' ? `建议 ${advisedArrivalTime} 前到达` : '按领队通知时间到达',
        '开启位置共享以便团队追踪',
      ],
      participants,
      syncCount,
    };
  }

  private async loadMembers(tripId: string) {
    const rows = await this.prisma.tripCollaborator.findMany({
      where: { tripId },
    });
    const userIds = rows.map((r) => r.userId);
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, email: true, avatarUrl: true },
          })
        : [];
    const userMap = new Map(users.map((u) => [u.id, u]));

    return rows.map((row) => ({
      id: row.userId,
      displayName:
        userMap.get(row.userId)?.displayName ??
        userMap.get(row.userId)?.email?.split('@')[0] ??
        '成员',
      role: mapCollaboratorRole(row.role),
      avatarUrl: userMap.get(row.userId)?.avatarUrl ?? null,
    }));
  }

  private extractWorldFacts(snapshot: Awaited<ReturnType<TripContextSnapshotAssemblerService['assemble']>> | null) {
    if (!snapshot) return [];
    const facts: Array<{ id: string; category: string; summary: string }> = [];
    const ontology = snapshot.tripOntologyFacts ?? [];
    for (const f of ontology.slice(0, 8)) {
      facts.push({
        id: f.factId,
        category: f.predicate ?? 'general',
        summary: typeof f.value === 'string' ? f.value : JSON.stringify(f.value).slice(0, 120),
      });
    }
    return facts;
  }

  private async resolveCurrentActivityExtras(input: {
    tripId: string;
    userId: string;
    state: Awaited<ReturnType<TripsService['getTripState']>> | null;
    nextStop: Awaited<ReturnType<TripsService['getTripState']>>['nextStop'] | undefined;
    dayNumber: number;
    startDate: Date;
    endDate: Date;
  }): Promise<{ imageUrl: string | null; currentLocationName: string | null }> {
    const place = input.nextStop?.Place;
    const imageUrl = resolveActivityImageUrl(place?.metadata);

    const destLat =
      place?.latitude != null
        ? Number(place.latitude)
        : input.nextStop?.latitude != null
          ? Number(input.nextStop.latitude)
          : null;
    const destLng =
      place?.longitude != null
        ? Number(place.longitude)
        : input.nextStop?.longitude != null
          ? Number(input.nextStop.longitude)
          : null;

    const destinationLabel = resolveDestinationShortLabel({
      placeName: input.nextStop?.placeName,
      placeCategory: place?.category,
    });

    let distanceMeters: number | null = null;
    try {
      const presence = await this.prisma.tripInTripCommsPeerPresence.findUnique({
        where: { tripId_userId: { tripId: input.tripId, userId: input.userId } },
      });
      if (
        presence?.shareLocation &&
        presence.lastLat != null &&
        presence.lastLng != null &&
        destLat != null &&
        destLng != null &&
        isPlausibleCoord(destLat, destLng) &&
        isPlausibleCoord(presence.lastLat, presence.lastLng)
      ) {
        distanceMeters = haversineDistanceMeters(
          presence.lastLat,
          presence.lastLng,
          destLat,
          destLng,
        );
      }
    } catch {
      // comms optional
    }

    const rawItems = await this.loadTodayRawItems(
      input.tripId,
      input.startDate,
      input.endDate,
      input.dayNumber,
    );
    const nextItemIndex = input.nextStop?.itemId
      ? rawItems.findIndex((item) => item.id === input.nextStop!.itemId)
      : -1;
    const currentItem = input.state?.currentItemId
      ? rawItems.find((item) => item.id === input.state!.currentItemId)
      : undefined;
    const leadingTransit =
      currentItem?.itemType === 'TRANSIT'
        ? currentItem
        : nextItemIndex > 0
          ? [...rawItems.slice(0, nextItemIndex)].reverse().find((item) => item.itemType === 'TRANSIT')
          : rawItems.find((item) => item.itemType === 'TRANSIT');

    const roadLabel = extractRoadSegmentLabel({
      note: leadingTransit?.note,
      placeName: leadingTransit?.title,
      placeMetadata: leadingTransit?.placeMetadata,
      travelMode: leadingTransit?.travelMode,
      itemType: leadingTransit?.itemType,
    });

    const currentLocationName = buildCurrentLocationName({
      roadLabel,
      destinationLabel,
      distanceMeters,
    });

    return { imageUrl, currentLocationName };
  }

  private async loadTodayRawItems(tripId: string, startDate: Date, endDate: Date, dayIndex?: number) {
    const dayNumber = resolveDayNumber(startDate, endDate, DateTime.now(), dayIndex);
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      include: {
        TripDay: {
          orderBy: { date: 'asc' },
          include: {
            ItineraryItem: {
              orderBy: { startTime: 'asc' },
              include: { Place: true },
            },
          },
        },
      },
    });
    if (!trip) return [];
    const day = trip.TripDay[dayNumber - 1] ?? trip.TripDay[0];
    if (!day) return [];

    return day.ItineraryItem.map((item) => {
      const placeMeta = (item.Place?.metadata as Record<string, unknown>) ?? {};
      const lat =
        (placeMeta.lat as number | undefined) ??
        (placeMeta.latitude as number | undefined) ??
        null;
      const lng =
        (placeMeta.lng as number | undefined) ??
        (placeMeta.longitude as number | undefined) ??
        null;
      return {
        id: item.id,
        title: item.Place?.nameCN ?? item.Place?.nameEN ?? item.note ?? '行程项',
        startTime: item.startTime,
        endTime: item.endTime,
        placeLat: lat,
        placeLng: lng,
        itemType: item.type,
        note: item.note,
        travelMode: item.travelMode,
        placeMetadata: placeMeta,
        meta: {
          experienceType: item.type,
          category: item.costCategory ?? undefined,
          merchantName: item.Place?.nameEN ?? item.Place?.nameCN ?? undefined,
          confirmationCode: item.bookingConfirmation ?? undefined,
        },
      };
    });
  }

  private async loadTodayItems(
    tripId: string,
    startDate: Date,
    endDate: Date,
    dayIndex?: number,
    opts?: {
      state?: Awaited<ReturnType<TripsService['getTripState']>> | null;
    },
  ): Promise<MobileTodayItineraryItemDto[]> {
    const [state, tripRow] = await Promise.all([
      opts?.state !== undefined
        ? Promise.resolve(opts.state)
        : this.tripsService.getTripState(tripId).catch(() => null),
      this.prisma.trip.findUnique({ where: { id: tripId }, select: { metadata: true } }),
    ]);
    const now = DateTime.now();
    const raw = await this.loadTodayRawItems(tripId, startDate, endDate, dayIndex);
    const meta = (tripRow?.metadata as Record<string, unknown>) ?? {};
    const delayMinutes = typeof meta.inTripDelayMinutes === 'number' ? meta.inTripDelayMinutes : 0;
    const mobileExecution =
      (meta.mobileExecution as {
        completedActivities?: Record<string, unknown>;
        activityOverrides?: Record<
          string,
          { title?: string; notes?: string; plannedDepartAt?: string }
        >;
      }) ?? {};
    const completedIds = new Set(Object.keys(mobileExecution.completedActivities ?? {}));
    const overrides = mobileExecution.activityOverrides ?? {};

    return raw.map((item) => {
      const itemMeta = item.meta;
      const override = overrides[item.id];
      const activityCtx = readActivityContextFromTripMetadata(meta, item.id);
      const isCurrent = state?.currentItemId === item.id;
      const isManuallyCompleted = completedIds.has(item.id);
      const status = isManuallyCompleted
        ? ('completed' as const)
        : inferExecutionItemStatus({
            startTime: item.startTime,
            endTime: item.endTime,
            now,
            isCurrent,
            isDelayed: delayMinutes > 15 && isCurrent,
          });
      const title = override?.title ?? item.title;
      return {
        id: item.id,
        time: formatTimeHHmm(item.startTime),
        endTime: item.endTime ? formatTimeHHmm(item.endTime) : undefined,
        title,
        location: title,
        duration: formatDurationMinutes(item.startTime, item.endTime),
        experienceType: String(itemMeta.experienceType ?? itemMeta.category ?? ''),
        memberCount: undefined,
        impactNote: delayMinutes > 0 ? `延误约 ${delayMinutes} 分钟` : undefined,
        status,
        merchantName: String(itemMeta.merchantName ?? ''),
        confirmationCode: String(itemMeta.confirmationCode ?? ''),
        plannedDepartAt:
          override?.plannedDepartAt ??
          activityCtx.plannedDepartAt ??
          item.startTime?.toISOString() ??
          null,
      };
    });
  }
}
