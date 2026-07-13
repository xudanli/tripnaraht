import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { TripListQueryDto } from '../dto/trip-list.dto';
import type { TripListPageResponse } from '../dto/frontend-trip-list-api.types';
import { parseBudgetConfig, resolveBudgetIntent } from '../budget-os/utils/budget-config.util';
import { TripStatus } from '../dto/trip-status.dto';
import {
  buildTripListSummary,
  expandStatusFilter,
  mapTripRowToListCard,
  sortTripsForListPage,
} from '../utils/trip-list-bff.projection.util';
import { resolveTripCoverImageUrl } from '../utils/cover-image.util';

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

  constructor(private readonly prisma: PrismaService) {}

  async getTripListPage(
    userId: string | undefined,
    query: TripListQueryDto,
  ): Promise<TripListPageResponse> {
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const includeCancelled = query.includeCancelled ?? true;

    const where = this.buildWhereClause(userId, query.status, includeCancelled);
    const [total, indexRows] = await Promise.all([
      this.prisma.trip.count({ where }),
      this.prisma.trip.findMany({
        where,
        select: { id: true, status: true, createdAt: true },
      }),
    ]);

    const pageIds = sortTripsForListPage(indexRows)
      .slice(offset, offset + limit)
      .map((row) => row.id);

    if (pageIds.length === 0) {
      return { trips: [], total };
    }

    const tripRows = await this.prisma.trip.findMany({
      where: { id: { in: pageIds } },
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
    });

    const rowById = new Map(tripRows.map((trip) => [trip.id, trip]));
    const pageRows = pageIds
      .map((id) => rowById.get(id))
      .filter((trip) => trip != null) as LiteTripRow[];

    const destinationCodes = [...new Set(pageRows.map((trip) => trip.destination.toUpperCase()))];

    const [countryProfiles, collaboratorMap] = await Promise.all([
      destinationCodes.length > 0
        ? this.prisma.countryProfile.findMany({
            where: { isoCode: { in: destinationCodes } },
            select: { isoCode: true, nameCN: true, currencyCode: true, coverImageUrl: true },
          })
        : Promise.resolve([]),
      this.loadCollaboratorsForTrips(pageIds),
    ]);

    const countryByCode = new Map(
      countryProfiles.map((profile) => [profile.isoCode.toUpperCase(), profile]),
    );

    const cards = pageRows.map((trip) => {
      const country = countryByCode.get(trip.destination.toUpperCase());
      const countryCover =
        typeof country?.coverImageUrl === 'string' && country.coverImageUrl.trim().length > 0
          ? country.coverImageUrl.trim()
          : null;
      const coverImageUrl = resolveTripCoverImageUrl(trip.id, trip.metadata, [], countryCover);

      return this.buildTripListCard(
        trip,
        countryByCode,
        collaboratorMap.get(trip.id) ?? [],
        coverImageUrl,
      );
    });

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

  private buildTripListCard(
    trip: LiteTripRow,
    countryByCode: Map<
      string,
      { isoCode: string; nameCN: string; currencyCode: string | null; coverImageUrl: string | null }
    >,
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
      });
    } catch (error: unknown) {
      this.logger.warn(
        `trip-list summary failed for ${trip.id}: ${error instanceof Error ? error.message : error}`,
      );
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
}
