import { Injectable, Logger, Optional } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { PlanningConflictsService } from '../trip-constraint-solver/services/planning-conflicts.service';
import { TripListQueryDto } from '../dto/trip-list.dto';
import type { TripListPageResponse } from '../dto/frontend-trip-list-api.types';
import { CoverImageService } from './cover-image.service';
import { parseBudgetConfig, resolveBudgetIntent } from '../budget-os/utils/budget-config.util';
import { TripStatus } from '../dto/trip-status.dto';
import {
  buildTripListSummary,
  expandStatusFilter,
  mapTripRowToListCard,
  sortTripsForListPage,
} from '../utils/trip-list-bff.projection.util';

type LiteTripRow = {
  id: string;
  name: string | null;
  destination: string;
  startDate: Date;
  endDate: Date;
  status: string | null;
  budgetConfig: unknown;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
  TripDay: Array<{ id: string; date: Date; _count: { ItineraryItem: number } }>;
  _count: { TripCollaborator: number };
};

@Injectable()
export class TripListService {
  private readonly logger = new Logger(TripListService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly coverImageService: CoverImageService,
    @Optional() private readonly planningConflicts?: PlanningConflictsService,
  ) {}

  async getTripListPage(
    userId: string | undefined,
    query: TripListQueryDto,
  ): Promise<TripListPageResponse> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const includeCancelled = query.includeCancelled ?? true;

    const where = this.buildWhereClause(userId, query.status, includeCancelled);
    const [total, tripRows] = await Promise.all([
      this.prisma.trip.count({ where }),
      this.prisma.trip.findMany({
        where,
        select: {
          id: true,
          name: true,
          destination: true,
          startDate: true,
          endDate: true,
          status: true,
          budgetConfig: true,
          metadata: true,
          createdAt: true,
          updatedAt: true,
          TripDay: {
            select: {
              id: true,
              date: true,
              _count: { select: { ItineraryItem: true } },
            },
            orderBy: { date: 'asc' },
          },
          _count: { select: { TripCollaborator: true } },
        },
      }),
    ]);

    const sortedRows = sortTripsForListPage(tripRows);
    const pageRows = sortedRows.slice(offset, offset + limit);
    const destinationCodes = [...new Set(pageRows.map((trip) => trip.destination.toUpperCase()))];

    const [countryProfiles, collaboratorMap] = await Promise.all([
      destinationCodes.length > 0
        ? this.prisma.countryProfile.findMany({
            where: { isoCode: { in: destinationCodes } },
            select: { isoCode: true, nameCN: true, currencyCode: true },
          })
        : Promise.resolve([]),
      this.loadCollaboratorsForTrips(pageRows.map((trip) => trip.id)),
    ]);

    const countryByCode = new Map(
      countryProfiles.map((profile) => [profile.isoCode.toUpperCase(), profile]),
    );

    const coverImageByTripId = await this.coverImageService.resolveCoverImagesForTrips(
      pageRows.map((trip) => ({
        id: trip.id,
        destination: trip.destination,
        metadata: trip.metadata,
      })),
    );

    const cards = await Promise.all(
      pageRows.map((trip) =>
        this.buildTripListCard(
          trip,
          countryByCode,
          collaboratorMap.get(trip.id) ?? [],
          coverImageByTripId.get(trip.id) ?? null,
        ),
      ),
    );

    return { trips: cards, total };
  }

  private buildWhereClause(
    userId: string | undefined,
    statusFilter: string | undefined,
    includeCancelled: boolean,
  ) {
    const where: Record<string, unknown> = {};

    if (userId) {
      where.TripCollaborator = { some: { userId } };
    }

    const statuses = statusFilter
      ? expandStatusFilter(statusFilter.split(','))
      : includeCancelled
        ? []
        : ['PLANNING', 'IN_PROGRESS', 'TRAVELING', 'COMPLETED', 'DRAFT', 'RECRUITING', 'FORMING'];

    if (statuses.length > 0) {
      where.status = { in: statuses };
    } else if (!includeCancelled) {
      where.status = { not: TripStatus.CANCELLED };
    }

    return where;
  }

  private async loadCollaboratorsForTrips(tripIds: string[]) {
    const map = new Map<
      string,
      Array<{ userId: string; name?: string; avatarUrl?: string | null }>
    >();
    if (tripIds.length === 0) return map;

    const collaborators = await this.prisma.tripCollaborator.findMany({
      where: { tripId: { in: tripIds } },
      orderBy: { createdAt: 'asc' },
      select: { tripId: true, userId: true },
    });

    const userIds = [...new Set(collaborators.map((row) => row.userId))];
    const users =
      userIds.length > 0
        ? await this.prisma.user.findMany({
            where: { id: { in: userIds } },
            select: { id: true, displayName: true, avatarUrl: true },
          })
        : [];
    const userById = new Map(users.map((user) => [user.id, user]));

    for (const row of collaborators) {
      const user = userById.get(row.userId);
      const entry = {
        userId: row.userId,
        name: user?.displayName ?? undefined,
        avatarUrl: user?.avatarUrl ?? null,
      };
      const existing = map.get(row.tripId) ?? [];
      existing.push(entry);
      map.set(row.tripId, existing);
    }

    return map;
  }

  private async buildTripListCard(
    trip: LiteTripRow,
    countryByCode: Map<string, { isoCode: string; nameCN: string; currencyCode: string | null }>,
    collaborators: Array<{ userId: string; name?: string; avatarUrl?: string | null }>,
    coverImageUrl: string | null,
  ) {
    const budgetIntent = resolveBudgetIntent(parseBudgetConfig(trip.budgetConfig));
    const totalBudget = budgetIntent?.total ?? 0;
    const country = countryByCode.get(trip.destination.toUpperCase());
    const currency = budgetIntent?.currency ?? country?.currencyCode ?? undefined;
    const memberCount = Math.max(collaborators.length, trip._count.TripCollaborator, 1);
    const memberAvatars = collaborators.slice(0, 4).map((member) => ({
      userId: member.userId,
      name: member.name,
      avatarUrl: member.avatarUrl,
    }));

    let listSummary = null;
    try {
      const conflictSummary = await this.loadConflictSummary(trip.id);
      listSummary = buildTripListSummary({
        destination: trip.destination,
        status: trip.status,
        startDate: trip.startDate,
        endDate: trip.endDate,
        metadata: trip.metadata,
        coverImageUrl,
        totalItems: trip.TripDay.reduce((sum, day) => sum + day._count.ItineraryItem, 0),
        daysWithItems: trip.TripDay.filter((day) => day._count.ItineraryItem > 0).length,
        totalDays: trip.TripDay.length,
        memberCount,
        memberAvatars,
        totalBudget,
        currency,
        conflictSummary,
      });
    } catch (error: unknown) {
      this.logger.warn(
        `trip-list summary failed for ${trip.id}: ${error instanceof Error ? error.message : error}`,
      );
      try {
        listSummary = buildTripListSummary({
          destination: trip.destination,
          status: trip.status,
          startDate: trip.startDate,
          endDate: trip.endDate,
          metadata: trip.metadata,
          coverImageUrl,
          totalItems: trip.TripDay.reduce((sum, day) => sum + day._count.ItineraryItem, 0),
          daysWithItems: trip.TripDay.filter((day) => day._count.ItineraryItem > 0).length,
          totalDays: trip.TripDay.length,
          memberCount,
          memberAvatars,
          totalBudget,
          currency,
          conflictSummary: null,
        });
      } catch {
        listSummary = null;
      }
    }

    return mapTripRowToListCard({
      trip,
      destinationLabel: country?.nameCN ?? undefined,
      currency,
      totalBudget,
      memberCount,
      memberAvatars,
      listSummary,
    });
  }

  private async loadConflictSummary(tripId: string) {
    if (!this.planningConflicts) return null;
    try {
      const { response } = await this.planningConflicts.loadArtifactsFast(tripId);
      return {
        mustHandle: response.summary.mustHandle,
        pendingConfirm: response.summary.pendingConfirm,
        conflicts: response.conflicts,
      };
    } catch {
      return null;
    }
  }
}
