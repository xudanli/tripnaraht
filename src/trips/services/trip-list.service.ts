import { Injectable, Logger } from '@nestjs/common';
import { DateTime } from 'luxon';
import { PrismaService } from '../../prisma/prisma.service';
import { TripListQueryDto } from '../dto/trip-list.dto';
import type { TripListCardDto, TripListPageResponse } from '../dto/frontend-trip-list-api.types';
import { TripStatus } from '../dto/trip-status.dto';
import {
  expandStatusFilter,
  resolveDisplayStatusLabel,
  resolvePrimaryAction,
  resolveTripListDisplayStatus,
  toApiTripStatus,
} from '../utils/trip-list-bff.projection.util';

type LiteTripRow = {
  id: string;
  name: string | null;
  destination: string;
  startDate: Date;
  endDate: Date;
  status: string | null;
  budgetConfig: unknown;
  createdAt: Date;
  updatedAt: Date;
};

function readBudgetFromConfig(budgetConfig: unknown): {
  totalBudget: number;
  currency?: string;
} {
  if (!budgetConfig || typeof budgetConfig !== 'object') {
    return { totalBudget: 0 };
  }
  const cfg = budgetConfig as Record<string, unknown>;
  const rawTotal = cfg.totalBudget ?? cfg.total;
  const totalBudget =
    typeof rawTotal === 'number' && Number.isFinite(rawTotal) ? rawTotal : 0;
  const currency =
    typeof cfg.currency === 'string' && cfg.currency.trim().length > 0
      ? cfg.currency.trim().toUpperCase()
      : undefined;
  return { totalBudget, currency };
}

type CountryListProfile = {
  isoCode: string;
  nameCN: string;
  coverImageUrl: string | null;
};

/**
 * Home trip list BFF — intentionally thin for <300ms.
 *
 * Dropped vs full detail: metadata, TripDay, collaborators, progress/readiness.
 * budgetConfig is selected only to project totalBudget + currency onto the card.
 * Cover = country profile; duration/status derived from trip dates + status only.
 */
@Injectable()
export class TripListService {
  private readonly logger = new Logger(TripListService.name);
  private static countryByCode: Map<string, CountryListProfile> | null = null;
  private static countryCacheAt = 0;
  private static readonly COUNTRY_CACHE_TTL_MS = 10 * 60 * 1000;

  constructor(private readonly prisma: PrismaService) {}

  async getTripListPage(
    userId: string | undefined,
    query: TripListQueryDto,
  ): Promise<TripListPageResponse> {
    const started = Date.now();
    const limit = query.limit ?? 50;
    const offset = query.offset ?? 0;
    const includeCancelled = query.includeCancelled ?? true;
    const where = this.buildWhereClause(userId, query.status, includeCancelled);

    const [total, pageRows, countryByCode] = await Promise.all([
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
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
        skip: offset,
        take: limit,
      }),
      this.loadCountryIndex(),
    ]);

    if (pageRows.length === 0) {
      this.logTiming(started, 0, total);
      return { trips: [], total };
    }

    const trips = pageRows.map((trip) => this.toCard(trip, countryByCode));
    this.logTiming(started, trips.length, total);
    return { trips, total };
  }

  private async loadCountryIndex(): Promise<Map<string, CountryListProfile>> {
    const now = Date.now();
    if (
      TripListService.countryByCode &&
      now - TripListService.countryCacheAt < TripListService.COUNTRY_CACHE_TTL_MS
    ) {
      return TripListService.countryByCode;
    }

    const rows = await this.prisma.countryProfile.findMany({
      select: { isoCode: true, nameCN: true, coverImageUrl: true },
    });
    const map = new Map(
      rows.map((row) => [row.isoCode.toUpperCase(), row] as const),
    );
    TripListService.countryByCode = map;
    TripListService.countryCacheAt = now;
    return map;
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

  private toCard(
    trip: LiteTripRow,
    countryByCode: Map<string, CountryListProfile>,
  ): TripListCardDto {
    const country = countryByCode.get(trip.destination.toUpperCase());
    const coverImageUrl =
      typeof country?.coverImageUrl === 'string' && country.coverImageUrl.trim().length > 0
        ? country.coverImageUrl.trim()
        : null;
    const displayStatus = resolveTripListDisplayStatus({
      status: trip.status,
      startDate: trip.startDate,
    });
    const durationDays = Math.max(
      1,
      Math.ceil(
        DateTime.fromJSDate(trip.endDate)
          .startOf('day')
          .diff(DateTime.fromJSDate(trip.startDate).startOf('day'), 'days').days,
      ) + 1,
    );

    const { totalBudget, currency } = readBudgetFromConfig(trip.budgetConfig);

    return {
      id: trip.id,
      name: trip.name ?? undefined,
      destination: trip.destination,
      destinationLabel: country?.nameCN ?? undefined,
      startDate: trip.startDate.toISOString(),
      endDate: trip.endDate.toISOString(),
      status: toApiTripStatus(trip.status),
      totalBudget,
      ...(currency ? { currency } : {}),
      days: [],
      createdAt: trip.createdAt.toISOString(),
      updatedAt: trip.updatedAt.toISOString(),
      listSummary: {
        displayStatus,
        displayStatusLabel: resolveDisplayStatusLabel(displayStatus),
        coverImageUrl,
        durationDays,
        memberCount: 1,
        primaryAction: resolvePrimaryAction(displayStatus),
      },
    };
  }

  private logTiming(started: number, count: number, total: number) {
    const ms = Date.now() - started;
    if (ms >= 200) {
      this.logger.warn(`trip-list slow: ${ms}ms count=${count} total=${total}`);
    } else {
      this.logger.debug(`trip-list ${ms}ms count=${count} total=${total}`);
    }
  }
}
