import {
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  IcelandSelfDriveBootstrapResponse,
  IcelandSelfDriveInitialPlanState,
  IcelandSelfDriveTripMetadata,
  IcelandSelfDriveWarning,
} from '../types/iceland-self-drive.types';
import {
  computeCompletion,
  computeDrivingSettingsSummary,
} from './iceland-self-drive-completion.util';
import {
  bootstrapIcelandSelfDriveMetadata,
  isIcelandSelfDriveProductTrip,
} from './iceland-self-drive-metadata-hydrate.util';
import {
  buildGeneratedRoute,
  readIcelandSelfDriveMetadata,
} from './iceland-self-drive-response.util';
import {
  buildInitialPlanState,
  countInitialPlanMetrics,
  generatingInitialPlanState,
  type InitialPlanDayMetrics,
} from './iceland-self-drive-initial-plan.util';

@Injectable()
export class IcelandSelfDriveBootstrapService {
  private readonly logger = new Logger(IcelandSelfDriveBootstrapService.name);

  constructor(private readonly prisma: PrismaService) {}

  async getBootstrap(
    userId: string,
    tripId: string,
  ): Promise<IcelandSelfDriveBootstrapResponse> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: {
        id: true,
        metadata: true,
        startDate: true,
        endDate: true,
        destination: true,
        TripCollaborator: {
          where: { userId },
          select: { userId: true },
          take: 1,
        },
      },
    });

    if (!trip) {
      throw new NotFoundException({
        code: 'TRIP_NOT_FOUND',
        message: `Trip ${tripId} not found`,
      });
    }
    if (trip.TripCollaborator.length === 0) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Not a collaborator on this trip',
      });
    }

    let isd = readIcelandSelfDriveMetadata(trip.metadata);
    if (!isd) {
      if (!isIcelandSelfDriveProductTrip(trip.metadata, trip.destination)) {
        throw new NotFoundException({
          code: 'NOT_ICELAND_SELF_DRIVE',
          message: 'Trip is not an iceland_self_drive product trip',
        });
      }
      isd = await this.hydrateAndPersist(tripId, trip);
    }

    const generationStatus = isd.generationStatus ?? 'READY';
    const metrics = await countInitialPlanMetrics(this.prisma, tripId);
    const initialPlan = this.resolveInitialPlan(
      generationStatus,
      isd.initialPlan,
      metrics,
      isd.warnings ?? [],
    );

    return {
      tripId,
      generationStatus,
      generatedRoute: buildGeneratedRoute(
        isd.wizard,
        isd.routeSkeleton.regionSummary,
      ),
      completion: computeCompletion(isd),
      drivingSettingsSummary: {
        items: computeDrivingSettingsSummary(isd.drivingSettings),
      },
      initialPlan,
      initialScheduleReady: initialPlan.status === 'READY',
      scheduledItemCount:
        initialPlan.scheduledActivityCount + initialPlan.scheduledAnchorCount,
      activeProposalId: null,
      warnings: isd.warnings ?? [],
    };
  }

  private async hydrateAndPersist(
    tripId: string,
    trip: {
      startDate: Date | null;
      endDate: Date | null;
      destination: string | null;
      metadata: unknown;
    },
  ): Promise<IcelandSelfDriveTripMetadata> {
    const isd = bootstrapIcelandSelfDriveMetadata({
      tripId,
      startDate: trip.startDate,
      endDate: trip.endDate,
      destination: trip.destination,
      existingMeta: trip.metadata,
    });
    const prev = (trip.metadata as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: tripId },
      data: {
        metadata: toInputJsonValue({
          ...prev,
          icelandSelfDrive: isd,
          productLine: 'iceland_self_drive',
        }),
        updatedAt: new Date(),
      },
    });
    this.logger.log(`Hydrated icelandSelfDrive metadata for bootstrap trip=${tripId}`);
    return isd;
  }

  private resolveInitialPlan(
    generationStatus: string,
    stored: IcelandSelfDriveInitialPlanState | undefined,
    metrics: InitialPlanDayMetrics,
    warnings: IcelandSelfDriveWarning[],
  ): IcelandSelfDriveInitialPlanState {
    if (generationStatus === 'RUNNING') {
      return generatingInitialPlanState(metrics);
    }
    if (stored) {
      return {
        ...stored,
        scheduledDayCount: metrics.scheduledDayCount || stored.scheduledDayCount,
        scheduledActivityCount:
          metrics.totalItemCount > 0
            ? metrics.scheduledActivityCount
            : stored.scheduledActivityCount,
        scheduledAnchorCount:
          metrics.totalItemCount > 0
            ? metrics.scheduledAnchorCount
            : stored.scheduledAnchorCount,
        emptyDayCount:
          metrics.scheduledDayCount > 0
            ? metrics.emptyDayCount
            : stored.emptyDayCount,
        fallbackAllowed: stored.status === 'FAILED',
        warnings: stored.warnings?.length ? stored.warnings : warnings,
      };
    }

    const status =
      metrics.scheduledActivityCount >= 1
        ? 'READY'
        : metrics.scheduledAnchorCount > 0
          ? 'PARTIAL'
          : 'FAILED';

    return buildInitialPlanState({
      status,
      verificationStatus: 'NOT_RUN',
      metrics,
      lastProposalId: null,
      generatedAt: status === 'FAILED' ? null : new Date().toISOString(),
      warnings,
    });
  }
}
