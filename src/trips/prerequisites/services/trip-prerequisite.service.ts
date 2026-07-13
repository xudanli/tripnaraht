import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { PoiAccessP0AssemblyService } from '../../../poi-access-capacity/services/poi-access-p0-assembly.service';
import type { FeasibilityIssueDto } from '../../trip-constraint-solver/types/trip-constraint-solver.types';
import type { TripPrerequisiteListDto } from '../types/trip-prerequisite.types';
import {
  applyPrerequisiteUserState,
  extractPrerequisitesFromIssues,
  summarizePrerequisites,
} from '../utils/prerequisite-extract.util';
import {
  enrichFeasibilityIssuesWithPrerequisiteIds,
  projectOpenPrerequisitesToDeparturePrepItems,
} from '../utils/prerequisite-projection.util';
import type { ReadinessFindingItem } from '../../readiness/types/readiness-findings.types';

@Injectable()
export class TripPrerequisiteService {
  private readonly logger = new Logger(TripPrerequisiteService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly poiAccessP0: PoiAccessP0AssemblyService,
  ) {}

  async listForTrip(tripId: string): Promise<TripPrerequisiteListDto> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) {
      throw new NotFoundException(`行程 ${tripId} 不存在`);
    }

    const prerequisites = await this.buildResolvedPrerequisites({
      id: trip.id,
      status: trip.status,
      startDate: trip.startDate,
      metadata: trip.metadata,
    });

    return {
      schema: 'tripnara.trip_prerequisites@v1',
      tripId,
      calculatedAt: new Date().toISOString(),
      prerequisites,
      summary: summarizePrerequisites(prerequisites),
      links: {
        feasibilityReport: `/api/trips/${tripId}/feasibility-report`,
        departurePreparation: `/api/readiness/trip/${tripId}`,
        departureGate: `/api/trips/${tripId}/departure-gate`,
      },
    };
  }

  async buildResolvedPrerequisites(trip: {
    id: string;
    status?: string | null;
    startDate: Date;
    metadata: unknown;
  }) {
    const [p0Issues, checklistRows, notApplicableRows] = await Promise.all([
      this.poiAccessP0.buildFeasibilityIssues(trip),
      this.prisma.tripChecklistStatus.findMany({
        where: { tripId: trip.id, checked: true },
        select: { findingId: true, updatedAt: true },
      }),
      this.prisma.tripFindingMark.findMany({
        where: { tripId: trip.id, markType: 'not_applicable' },
        select: { findingId: true },
      }),
    ]);

    const enrichedIssues = await this.enrichFeasibilityIssues(trip.id, p0Issues);
    const extracted = extractPrerequisitesFromIssues(trip.id, enrichedIssues);
    const checkedIds = new Set(checklistRows.map((r) => r.findingId));
    const notApplicableIds = new Set(notApplicableRows.map((r) => r.findingId));
    const confirmedAtById = new Map(
      checklistRows.map((r) => [r.findingId, r.updatedAt.toISOString()]),
    );

    return applyPrerequisiteUserState(extracted, {
      checkedIds,
      notApplicableIds,
      confirmedAtById,
    });
  }

  async enrichFeasibilityIssues(
    tripId: string,
    issues: FeasibilityIssueDto[],
  ): Promise<FeasibilityIssueDto[]> {
    const extracted = extractPrerequisitesFromIssues(tripId, issues);
    return enrichFeasibilityIssuesWithPrerequisiteIds(tripId, issues, extracted);
  }

  async projectDeparturePrepItems(tripId: string): Promise<ReadinessFindingItem[]> {
    const trip = await this.prisma.trip.findUnique({ where: { id: tripId } });
    if (!trip) return [];

    try {
      const prerequisites = await this.buildResolvedPrerequisites({
        id: trip.id,
        status: trip.status,
        startDate: trip.startDate,
        metadata: trip.metadata,
      });
      return projectOpenPrerequisitesToDeparturePrepItems(prerequisites);
    } catch (err) {
      this.logger.warn(
        `Prerequisite departure prep projection skipped for ${tripId}: ${(err as Error).message}`,
      );
      return [];
    }
  }
}
