import { Injectable, Logger, NotFoundException, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  TimelineOverviewResponseDto,
} from '../dto/timeline-overview.dto';
import { TripsService } from '../trips.service';
import { TripMetricsService } from './trip-metrics.service';
import { TripConflictsService } from './trip-conflicts.service';
import { TripSuggestionsService } from './trip-suggestions.service';
import { TripFileService } from '../trip-files/services/trip-file.service';
import { PlanningConflictsService } from '../trip-constraint-solver/services/planning-conflicts.service';
import { SuggestionStatus } from '../dto/suggestions.dto';
import { PersonaAlertDto } from '../dto/persona-alerts.dto';
import { TaskDto } from '../dto/tasks.dto';
import { PipelineStageDto } from '../dto/pipeline-status.dto';
import type { ConflictDto } from '../dto/trip-conflicts.dto';
import {
  buildHealthSnapshot,
  computeFeasibilityScoreFromConflicts,
  computePaceScoreFromMetrics,
  computePlanningProgress,
  CONFIRMED_BOOKING_STATUSES,
  itemNeedsBooking,
  parseTimelineOverviewInclude,
  PENDING_BOOKING_STATUSES,
} from '../utils/timeline-overview.util';
import { buildTimelinePlanObjectsSummary } from '../utils/timeline-plan-objects.util';
import type { PlanObjectProjectionService } from '../../decision-runtime/plan-objects/services/plan-object-projection.service';
import { OverallTripReadinessService } from '../overall-readiness/services/overall-trip-readiness.service';

const MAX_TASKS = 10;
const MAX_REMINDERS = 5;

type TimelineTripContext = {
  id: string;
  destination?: string | null;
  startDate?: Date | null;
  endDate?: Date | null;
  createdAt?: Date | null;
  updatedAt?: Date | null;
  pacingConfig?: unknown;
  metadata?: unknown;
  TripDay: Array<{
    id: string;
    date: Date;
    ItineraryItem: unknown[];
  }>;
};

@Injectable()
export class TimelineOverviewService {
  private readonly logger = new Logger(TimelineOverviewService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tripsService: TripsService,
    private readonly tripMetrics: TripMetricsService,
    private readonly tripConflicts: TripConflictsService,
    private readonly tripSuggestions: TripSuggestionsService,
    @Optional() private readonly tripFiles?: TripFileService,
    @Optional() private readonly planningConflicts?: PlanningConflictsService,
    @Optional() private readonly planObjectProjection?: PlanObjectProjectionService,
    @Optional() private readonly overallReadiness?: OverallTripReadinessService,
  ) {}

  async getTimelineOverview(
    tripId: string,
    userId: string | undefined,
    query: { include?: string },
  ): Promise<TimelineOverviewResponseDto> {
    const include = parseTimelineOverviewInclude(query.include);

    await this.assertTripReadable(tripId, userId);

    const needsFullTrip =
      include.has('pipeline') || include.has('tasks') || include.has('suggestions');
    const needsLiteTrip = include.has('stats') && !needsFullTrip;
    const needsAlerts =
      include.has('reminders') ||
      include.has('tasks') ||
      include.has('pipeline') ||
      include.has('suggestions') ||
      include.has('stats');
    const needsConflicts = include.has('stats') || include.has('suggestions');

    const [
      tripResult,
      alertsResult,
      conflictsResult,
      metricsResult,
      bookingItemsResult,
      filesStatsResult,
    ] = await Promise.allSettled([
      needsFullTrip
        ? this.loadTimelineTripContext(tripId, 'full')
        : needsLiteTrip
          ? this.loadTimelineTripContext(tripId, 'lite')
          : Promise.resolve(null),
      needsAlerts
        ? this.tripsService.getPersonaAlerts(tripId)
        : Promise.resolve([] as PersonaAlertDto[]),
      needsConflicts
        ? this.loadConflictContext(tripId)
        : Promise.resolve(null),
      include.has('stats') ? this.tripMetrics.getTripMetrics(tripId) : Promise.resolve(null),
      include.has('stats') ? this.loadBookingItems(tripId) : Promise.resolve([]),
      include.has('stats') && this.tripFiles
        ? this.tripFiles.getStats(tripId, userId ?? 'anonymous-dev-user')
        : Promise.resolve(null),
    ]);

    const tripContext = this.unwrap(tripResult, null);
    const alerts = this.unwrap(alertsResult, [] as PersonaAlertDto[]);
    const conflictContext = this.unwrap(conflictsResult, null);
    const conflicts = conflictContext
      ? { conflicts: conflictContext.conflicts }
      : { conflicts: [] as ConflictDto[] };
    const metrics = this.unwrap(metricsResult, null);
    const bookingItems = this.unwrap(bookingItemsResult, [] as Array<{ bookingStatus: string | null; type: string }>);
    const filesStats = this.unwrap(filesStatsResult, null);

    const conflictList = conflicts?.conflicts ?? [];
    const suggestionPreload = {
      trip: tripContext ?? undefined,
      personaAlerts: alerts,
      conflictsResponse: conflicts ?? undefined,
    };

    const [pipelineResult, tasksResult, suggestionsResult] = await Promise.allSettled([
      include.has('pipeline')
        ? this.tripsService.getPipelineStatus(tripId, {
            trip: tripContext ?? undefined,
            personaAlerts: alerts,
          })
        : Promise.resolve(null),
      include.has('tasks')
        ? this.tripsService.getTasks(tripId, {
            trip: tripContext ?? undefined,
            personaAlerts: alerts,
          })
        : Promise.resolve([] as TaskDto[]),
      include.has('suggestions')
        ? this.tripSuggestions.getSuggestions(
            tripId,
            { status: SuggestionStatus.NEW, limit: 200 },
            suggestionPreload,
          )
        : include.has('stats')
          ? this.tripSuggestions
              .countNewSuggestions(tripId, suggestionPreload)
              .then((total) => ({ total, items: [] }))
          : Promise.resolve(null),
    ]);

    const pipeline = this.unwrap(pipelineResult, { stages: [] as PipelineStageDto[] });
    const tasks = this.unwrap(tasksResult, [] as TaskDto[]);
    const suggestions = this.unwrap(suggestionsResult, null);

    const feasibilityScore = computeFeasibilityScoreFromConflicts(conflictList);
    const paceScore = metrics ? computePaceScoreFromMetrics(metrics) : 100;
    const planning = computePlanningProgress(pipeline?.stages ?? []);

    const pendingConfirmationCount = this.countPendingBookings(bookingItems);
    const newSuggestionCount = suggestions?.total ?? suggestions?.items?.length ?? 0;

    const incompleteTasks = tasks.filter((t) => !t.completed);
    const todayReminders = this.pickTodayReminders(alerts);

    const stats = {
      feasibilityScore,
      paceScore,
      conflictCount: conflictContext?.ssotConflictCount ?? conflictList.length,
      conflictCountSource: conflictContext?.conflictCountSource ?? 'schedule_conflicts',
      pendingConfirmationCount,
      filesPendingCount: filesStats?.pendingCount,
      newSuggestionCount,
    };

    const response: TimelineOverviewResponseDto = {
      tripId,
      stats,
      planning: {
        ...planning,
        stages: pipeline?.stages ?? [],
      },
      tasks: tasks.slice(0, MAX_TASKS),
      incompleteTaskCount: incompleteTasks.length,
      todayReminders,
      generatedAt: new Date().toISOString(),
    };

    if (include.has('readiness') && this.overallReadiness) {
      try {
        response.overallReadiness = await this.overallReadiness.getCard(tripId, userId);
      } catch (err) {
        this.logger.warn(
          `overall readiness card failed trip=${tripId}: ${(err as Error).message}`,
        );
      }
    }

    if (include.has('health')) {
      response.health = buildHealthSnapshot(
        feasibilityScore,
        paceScore,
        conflictContext?.ssotConflictCount ?? conflictList.length,
      );
    }

    if (include.has('planobjects') && this.planObjectProjection?.isEnabled()) {
      try {
        const projection = await this.planObjectProjection.buildProjection(tripId);
        response.planObjects = buildTimelinePlanObjectsSummary(projection);
      } catch (e: unknown) {
        this.logger.warn(
          `timeline-overview planObjects skipped: ${e instanceof Error ? e.message : e}`,
        );
      }
    }

    return response;
  }

  private async loadConflictContext(tripId: string): Promise<{
    conflicts: ConflictDto[];
    ssotConflictCount: number;
    conflictCountSource: 'ssot_planning_conflicts' | 'schedule_conflicts';
  }> {
    const scheduleConflicts = await this.tripConflicts.getConflicts(tripId, undefined, undefined, {
      useRouteApi: false,
    });

    if (this.planningConflicts) {
      try {
        const { response } = await this.planningConflicts.loadArtifactsFast(tripId);
        return {
          conflicts: scheduleConflicts.conflicts,
          ssotConflictCount: response.summary.total,
          conflictCountSource: 'ssot_planning_conflicts',
        };
      } catch {
        // fall through to schedule-only count
      }
    }

    return {
      conflicts: scheduleConflicts.conflicts,
      ssotConflictCount: scheduleConflicts.conflicts.length,
      conflictCountSource: 'schedule_conflicts',
    };
  }

  private async loadTimelineTripContext(
    tripId: string,
    mode: 'full' | 'lite',
  ): Promise<TimelineTripContext | null> {
    if (mode === 'lite') {
      return this.prisma.trip.findUnique({
        where: { id: tripId },
        select: {
          id: true,
          TripDay: {
            select: {
              id: true,
              date: true,
              ItineraryItem: { select: { id: true } },
            },
          },
        },
      }) as Promise<TimelineTripContext | null>;
    }

    return this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        destination: true,
        startDate: true,
        endDate: true,
        createdAt: true,
        updatedAt: true,
        pacingConfig: true,
        metadata: true,
        TripDay: {
          select: {
            id: true,
            date: true,
            ItineraryItem: { select: { id: true } },
          },
        },
      },
    }) as Promise<TimelineTripContext | null>;
  }

  /** Avoid full findOne (loads all days/items) on every BFF read. */
  private async assertTripReadable(tripId: string, userId?: string): Promise<void> {
    if (userId) {
      const collaborator = await this.prisma.tripCollaborator.findUnique({
        where: { tripId_userId: { tripId, userId } },
        select: { tripId: true },
      });
      if (!collaborator) {
        throw new NotFoundException(`行程 ID ${tripId} 不存在或您没有权限访问`);
      }
      return;
    }
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { id: true },
    });
    if (!trip) {
      throw new NotFoundException(`行程 ID ${tripId} 不存在`);
    }
  }

  private async loadBookingItems(tripId: string) {
    return this.prisma.itineraryItem.findMany({
      where: { TripDay: { tripId } },
      select: { bookingStatus: true, type: true },
    });
  }

  private countPendingBookings(
    items: Array<{ bookingStatus: string | null; type: string }>,
  ): number {
    return items.filter((item) => {
      const status = item.bookingStatus?.toUpperCase() ?? '';
      if (PENDING_BOOKING_STATUSES.has(status)) return true;
      if (CONFIRMED_BOOKING_STATUSES.has(status)) return false;
      return itemNeedsBooking(item.type) && !status;
    }).length;
  }

  private pickTodayReminders(alerts: PersonaAlertDto[]): PersonaAlertDto[] {
    const userFacing = alerts.filter(
      (a) => a.metadata?.audience !== 'internal' && a.persona !== 'USER_ACTION',
    );

    const todayScoped = userFacing.filter((a) => {
      const dayId = a.metadata?.dayId;
      if (!dayId) return true;
      return a.metadata?.expressionPhase === 'in_trip';
    });

    const sorted = (todayScoped.length > 0 ? todayScoped : userFacing).sort((a, b) => {
      const severityOrder = { warning: 0, info: 1, success: 2 };
      return (severityOrder[a.severity] ?? 9) - (severityOrder[b.severity] ?? 9);
    });

    return sorted.slice(0, MAX_REMINDERS);
  }

  private unwrap<T>(result: PromiseSettledResult<T>, fallback: T): T {
    if (result.status === 'fulfilled') {
      return result.value ?? fallback;
    }
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason);
    this.logger.warn(`timeline-overview partial failure: ${reason}`);
    return fallback;
  }
}
