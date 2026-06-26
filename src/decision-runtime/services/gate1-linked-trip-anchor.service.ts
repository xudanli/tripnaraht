import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { TripStatus } from '../../trips/dto/trip-status.dto';
import { isGate1LinkedTripAutoCreateEnabled } from '../decision-runtime.config';

export interface LinkedTripCoverageReport {
  totalProjects: number;
  withLinkedTrip: number;
  withoutLinkedTrip: number;
  coveragePct: number;
  activeWithoutTrip: number;
  inactiveWithoutTrip: number;
}

export interface LinkedTripBackfillResult {
  projectId: string;
  linkedTripId: string | null;
  action: 'skipped_has_trip' | 'linked_from_listing' | 'created_trip' | 'failed';
  error?: string;
}

@Injectable()
export class Gate1LinkedTripAnchorService {
  private readonly logger = new Logger(Gate1LinkedTripAnchorService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getCoverageReport(): Promise<LinkedTripCoverageReport> {
    const [totalProjects, withLinkedTrip, activeWithoutTrip] = await Promise.all([
      this.prisma.gate1Project.count(),
      this.prisma.gate1Project.count({ where: { linkedTripId: { not: null } } }),
      this.prisma.gate1Project.count({
        where: {
          linkedTripId: null,
          experimentStatus: { notIn: ['COMPLETED', 'WITHDRAWN'] },
        },
      }),
    ]);
    const withoutLinkedTrip = totalProjects - withLinkedTrip;
    const inactiveWithoutTrip = withoutLinkedTrip - activeWithoutTrip;
    const coveragePct =
      totalProjects === 0 ? 100 : Math.round((withLinkedTrip / totalProjects) * 10000) / 100;

    return {
      totalProjects,
      withLinkedTrip,
      withoutLinkedTrip,
      coveragePct,
      activeWithoutTrip,
      inactiveWithoutTrip,
    };
  }

  /**
   * Ensure a Gate1 project has linkedTripId on create.
   * Uses dto value, listing trip, or auto-creates a shell Trip when enabled.
   */
  async ensureOnCreate(input: {
    projectId: string;
    advisorUserId: string;
    title: string;
    destination?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    linkedTripId?: string | null;
  }): Promise<string | null> {
    if (input.linkedTripId) {
      return input.linkedTripId;
    }

    const fromListing = await this.resolveTripFromListing(input.projectId);
    if (fromListing) {
      await this.prisma.gate1Project.update({
        where: { id: input.projectId },
        data: { linkedTripId: fromListing },
      });
      return fromListing;
    }

    if (!isGate1LinkedTripAutoCreateEnabled()) {
      this.logger.debug(
        `[Gate1Anchor] Skip auto-create for project ${input.projectId} (flag off)`,
      );
      return null;
    }

    const tripId = await this.createShellTrip({
      advisorUserId: input.advisorUserId,
      title: input.title,
      destination: input.destination,
      startDate: input.startDate,
      endDate: input.endDate,
      gate1ProjectId: input.projectId,
    });

    await this.prisma.gate1Project.update({
      where: { id: input.projectId },
      data: { linkedTripId: tripId },
    });

    this.logger.log(`[Gate1Anchor] Auto-created Trip ${tripId} for project ${input.projectId}`);
    return tripId;
  }

  async backfillProject(projectId: string): Promise<LinkedTripBackfillResult> {
    const project = await this.prisma.gate1Project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        linkedTripId: true,
        advisorUserId: true,
        title: true,
        destination: true,
        startDate: true,
        endDate: true,
      },
    });

    if (!project) {
      return { projectId, linkedTripId: null, action: 'failed', error: 'PROJECT_NOT_FOUND' };
    }

    if (project.linkedTripId) {
      return {
        projectId,
        linkedTripId: project.linkedTripId,
        action: 'skipped_has_trip',
      };
    }

    try {
      const fromListing = await this.resolveTripFromListing(projectId);
      if (fromListing) {
        await this.prisma.gate1Project.update({
          where: { id: projectId },
          data: { linkedTripId: fromListing },
        });
        return { projectId, linkedTripId: fromListing, action: 'linked_from_listing' };
      }

      if (!isGate1LinkedTripAutoCreateEnabled()) {
        return {
          projectId,
          linkedTripId: null,
          action: 'failed',
          error: 'AUTO_CREATE_DISABLED',
        };
      }

      const tripId = await this.createShellTrip({
        advisorUserId: project.advisorUserId,
        title: project.title,
        destination: project.destination,
        startDate: project.startDate,
        endDate: project.endDate,
        gate1ProjectId: projectId,
      });

      await this.prisma.gate1Project.update({
        where: { id: projectId },
        data: { linkedTripId: tripId },
      });

      return { projectId, linkedTripId: tripId, action: 'created_trip' };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`[Gate1Anchor] Backfill failed for ${projectId}: ${message}`);
      return { projectId, linkedTripId: null, action: 'failed', error: message };
    }
  }

  async backfillAllMissing(): Promise<LinkedTripBackfillResult[]> {
    const projects = await this.prisma.gate1Project.findMany({
      where: { linkedTripId: null },
      select: { id: true },
      orderBy: { createdAt: 'asc' },
    });

    const results: LinkedTripBackfillResult[] = [];
    for (const project of projects) {
      results.push(await this.backfillProject(project.id));
    }
    return results;
  }

  private async resolveTripFromListing(projectId: string): Promise<string | null> {
    const listing = await this.prisma.trustedProjectListing.findFirst({
      where: { gate1ProjectId: projectId, tripId: { not: null } },
      select: { tripId: true },
      orderBy: { createdAt: 'desc' },
    });
    return listing?.tripId ?? null;
  }

  private async createShellTrip(input: {
    advisorUserId: string;
    title: string;
    destination?: string | null;
    startDate?: Date | null;
    endDate?: Date | null;
    gate1ProjectId: string;
  }): Promise<string> {
    const now = new Date();
    const startDate = input.startDate ?? new Date(now.getTime() + 30 * 86400000);
    const endDate =
      input.endDate ?? new Date(startDate.getTime() + 7 * 86400000);
    const tripId = randomUUID();

    await this.prisma.$transaction(async (tx) => {
      await tx.trip.create({
        data: {
          id: tripId,
          name: input.title,
          destination: (input.destination ?? 'UNSPECIFIED').toUpperCase().slice(0, 128),
          startDate,
          endDate,
          status: TripStatus.DRAFT,
          updatedAt: now,
          metadata: {
            source: 'gate1-auto-anchor',
            gate1ProjectId: input.gate1ProjectId,
          },
        },
      });

      await tx.tripCollaborator.create({
        data: {
          id: randomUUID(),
          tripId,
          userId: input.advisorUserId,
          role: 'OWNER',
          updatedAt: now,
        },
      });
    });

    return tripId;
  }
}
