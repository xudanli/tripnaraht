import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { DateTime } from 'luxon';
import { randomUUID } from 'crypto';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../../prisma/prisma.service';
import { ExplorationTripMaterializerService } from '../../exploration/services/exploration-trip-materializer.service';
import { EXPLORATION_SCENARIO_STATUS } from '../../exploration/constants/exploration-status.constants';
import type { ExplorationInput } from '../../exploration/types/exploration.types';
import type { CreateIcelandSelfDriveTripDto } from '../dto/create-iceland-self-drive-trip.dto';
import { LOCATION_PICKUP_CODES } from '../dictionaries/iceland-self-drive.dictionaries';
import {
  buildInitialDrivingSettings,
  computeCompletion,
} from './iceland-self-drive-completion.util';
import { IcelandSelfDriveRouteSkeletonService } from './iceland-self-drive-route-skeleton.service';
import { IcelandSelfDriveBookingAnchorService } from './iceland-self-drive-booking-anchor.service';
import { IcelandSelfDriveDraftService } from './iceland-self-drive-draft.service';
import {
  buildGeneratedRoute,
  readIcelandSelfDriveMetadata,
  readTripVersion,
} from './iceland-self-drive-response.util';
import type {
  IcelandSelfDriveCreateTripResponse,
  IcelandSelfDriveDomainEvent,
  IcelandSelfDriveRouteSkeleton,
  IcelandSelfDriveTripMetadata,
  IcelandSelfDriveWarning,
  IcelandSelfDriveWizardInput,
} from '../types/iceland-self-drive.types';
import { PRODUCT_LINE_ICELAND_SELF_DRIVE } from '../dto/iceland-self-drive-enums';

@Injectable()
export class IcelandSelfDriveCreateService {
  private readonly logger = new Logger(IcelandSelfDriveCreateService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly materializer: ExplorationTripMaterializerService,
    private readonly routeSkeleton: IcelandSelfDriveRouteSkeletonService,
    private readonly bookingAnchors: IcelandSelfDriveBookingAnchorService,
    private readonly drafts: IcelandSelfDriveDraftService,
  ) {}

  async createTrip(
    userId: string,
    dto: CreateIcelandSelfDriveTripDto,
    idempotencyKey: string | undefined,
  ): Promise<IcelandSelfDriveCreateTripResponse> {
    if (!userId) {
      throw new UnauthorizedException({
        code: 'UNAUTHORIZED',
        message: 'Login required',
      });
    }
    if (!idempotencyKey?.trim()) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'Idempotency-Key header is required',
      });
    }
    const key = idempotencyKey.trim();

    const existing = await this.findByIdempotencyKey(userId, key);
    if (existing) {
      this.logger.log(`Idempotency replay for key=${key} trip=${existing.tripId}`);
      return existing;
    }

    this.assertValidDates(dto);

    const wizard = this.toWizardInput(dto);
    const asyncGeneration = dto.asyncGeneration === true;
    const explorationInput = this.toExplorationInput(wizard);
    const scenarioId = randomUUID();

    await this.prisma.explorationScenario.create({
      data: {
        id: scenarioId,
        contextId: scenarioId,
        userId,
        status: EXPLORATION_SCENARIO_STATUS.DRAFT,
        researchProtocolId: null,
        initialInput: {
          ...explorationInput,
          productLine: PRODUCT_LINE_ICELAND_SELF_DRIVE,
          icelandSelfDrive: wizard,
        } as unknown as Prisma.InputJsonValue,
        assignedVariant: 'SINGLE_RECOMMENDATION',
      },
    });

    const materializeResult = await this.materializer.materializeShell({
      userId,
      scenarioId,
      initialInput: explorationInput,
      researchProtocolId: null,
    });

    const emptySkeleton: IcelandSelfDriveRouteSkeleton = {
      strategyId: 'pending',
      regionSummary: '',
      days: [],
    };

    const baseMeta: IcelandSelfDriveTripMetadata = {
      productLine: PRODUCT_LINE_ICELAND_SELF_DRIVE,
      idempotencyKey: key,
      contextVersion: 'cv_1',
      wizard,
      drivingSettings: buildInitialDrivingSettings(wizard.vehicleAcquisition),
      routeSkeleton: emptySkeleton,
      hardAnchors: [],
      warnings: [],
      createdAt: new Date().toISOString(),
      generationStatus: asyncGeneration ? 'RUNNING' : 'READY',
      lastEvents: [
        {
          type: 'trip_context_changed',
          at: new Date().toISOString(),
          message: 'Trip materialized for iceland_self_drive',
        },
      ],
    };

    if (!asyncGeneration) {
      const { skeleton, warnings, hardAnchors, events } =
        await this.completeGeneration(materializeResult.tripId, wizard);
      baseMeta.routeSkeleton = skeleton;
      baseMeta.warnings = warnings;
      baseMeta.hardAnchors = hardAnchors;
      baseMeta.generationStatus = 'READY';
      baseMeta.lastEvents = [...(baseMeta.lastEvents ?? []), ...events];
    }

    const trip = await this.prisma.trip.findUniqueOrThrow({
      where: { id: materializeResult.tripId },
      select: { metadata: true },
    });
    const prevMeta = (trip.metadata as Record<string, unknown>) ?? {};
    await this.prisma.trip.update({
      where: { id: materializeResult.tripId },
      data: {
        metadata: {
          ...prevMeta,
          source: 'iceland_self_drive',
          productLine: PRODUCT_LINE_ICELAND_SELF_DRIVE,
          icelandSelfDrive: baseMeta,
        } as unknown as Prisma.InputJsonValue,
      },
    });

    if (dto.draftId) {
      try {
        await this.drafts.markConsumed(userId, dto.draftId);
      } catch (err) {
        this.logger.warn(
          `Failed to mark draft ${dto.draftId} consumed: ${
            err instanceof Error ? err.message : String(err)
          }`,
        );
      }
    }

    if (asyncGeneration) {
      setImmediate(() => {
        void this.runAsyncGeneration(materializeResult.tripId, wizard).catch((err) => {
          this.logger.error(
            `Async route generation failed trip=${materializeResult.tripId}: ${
              err instanceof Error ? err.message : String(err)
            }`,
          );
        });
      });
    }

    const response: IcelandSelfDriveCreateTripResponse = {
      tripId: materializeResult.tripId,
      tripVersion: materializeResult.tripVersion,
      contextVersion: baseMeta.contextVersion,
      lifecycle: 'PLANNING',
      scenarioId,
      generationStatus: baseMeta.generationStatus,
      generatedRoute: buildGeneratedRoute(
        wizard,
        baseMeta.routeSkeleton.regionSummary || undefined,
      ),
      completion: computeCompletion(baseMeta),
      warnings: baseMeta.warnings,
    };

    this.logger.log(
      `Created iceland self-drive trip ${response.tripId} scenario=${scenarioId} status=${response.generationStatus}`,
    );
    return response;
  }

  private async runAsyncGeneration(
    tripId: string,
    wizard: IcelandSelfDriveWizardInput,
  ): Promise<void> {
    try {
      const { skeleton, warnings, hardAnchors, events } =
        await this.completeGeneration(tripId, wizard);

      const trip = await this.prisma.trip.findUniqueOrThrow({
        where: { id: tripId },
        select: { metadata: true },
      });
      const prev = (trip.metadata as Record<string, unknown>) ?? {};
      const isd = readIcelandSelfDriveMetadata(trip.metadata);
      if (!isd) return;

      const next: IcelandSelfDriveTripMetadata = {
        ...isd,
        routeSkeleton: skeleton,
        warnings,
        hardAnchors,
        generationStatus: 'READY',
        lastEvents: [...(isd.lastEvents ?? []), ...events],
      };

      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...prev,
            icelandSelfDrive: next,
          } as unknown as Prisma.InputJsonValue,
          updatedAt: new Date(),
        },
      });

      this.logger.log(`route_generated trip=${tripId} (async READY)`);
    } catch (err) {
      await this.markGenerationFailed(tripId, err);
      throw err;
    }
  }

  private async markGenerationFailed(tripId: string, err: unknown): Promise<void> {
    try {
      const trip = await this.prisma.trip.findUnique({
        where: { id: tripId },
        select: { metadata: true },
      });
      if (!trip) return;
      const prev = (trip.metadata as Record<string, unknown>) ?? {};
      const isd = readIcelandSelfDriveMetadata(trip.metadata);
      if (!isd) return;
      const next: IcelandSelfDriveTripMetadata = {
        ...isd,
        generationStatus: 'FAILED',
        lastEvents: [
          ...(isd.lastEvents ?? []),
          {
            type: 'route_generated',
            at: new Date().toISOString(),
            message: err instanceof Error ? err.message : 'generation failed',
          },
        ],
      };
      await this.prisma.trip.update({
        where: { id: tripId },
        data: {
          metadata: {
            ...prev,
            icelandSelfDrive: next,
          } as unknown as Prisma.InputJsonValue,
        },
      });
    } catch {
      /* ignore secondary failure */
    }
  }

  private async completeGeneration(
    tripId: string,
    wizard: IcelandSelfDriveWizardInput,
  ): Promise<{
    skeleton: IcelandSelfDriveRouteSkeleton;
    warnings: IcelandSelfDriveWarning[];
    hardAnchors: Awaited<ReturnType<IcelandSelfDriveBookingAnchorService['seedAnchors']>>;
    events: IcelandSelfDriveDomainEvent[];
  }> {
    const { skeleton, warnings } = this.routeSkeleton.build({
      startDate: wizard.dateRange.startDate,
      endDate: wizard.dateRange.endDate,
      regionIds: wizard.regionIds,
    });
    const hardAnchors = await this.bookingAnchors.seedAnchors(tripId, wizard.bookings);
    const events: IcelandSelfDriveDomainEvent[] = [
      {
        type: 'route_generated',
        at: new Date().toISOString(),
        message: `strategy=${skeleton.strategyId}`,
      },
    ];
    return { skeleton, warnings, hardAnchors, events };
  }

  private async findByIdempotencyKey(
    userId: string,
    key: string,
  ): Promise<IcelandSelfDriveCreateTripResponse | null> {
    const collabs = await this.prisma.tripCollaborator.findMany({
      where: { userId, role: 'OWNER' },
      orderBy: { updatedAt: 'desc' },
      take: 50,
      select: {
        tripId: true,
        Trip: { select: { id: true, status: true, metadata: true } },
      },
    });

    for (const row of collabs) {
      const isd = readIcelandSelfDriveMetadata(row.Trip.metadata);
      if (!isd || isd.idempotencyKey !== key) continue;

      const scenario = await this.prisma.explorationScenario.findFirst({
        where: { tripId: row.tripId },
        select: { id: true },
      });

      return {
        tripId: row.tripId,
        tripVersion: readTripVersion(row.Trip.metadata),
        contextVersion: isd.contextVersion,
        lifecycle: 'PLANNING',
        scenarioId: scenario?.id ?? '',
        generationStatus: isd.generationStatus ?? 'READY',
        generatedRoute: buildGeneratedRoute(isd.wizard, isd.routeSkeleton.regionSummary),
        completion: computeCompletion(isd),
        warnings: isd.warnings ?? [],
      };
    }
    return null;
  }

  private assertValidDates(dto: CreateIcelandSelfDriveTripDto): void {
    const start = DateTime.fromISO(dto.dateRange.startDate, { zone: 'utc' });
    const end = DateTime.fromISO(dto.dateRange.endDate, { zone: 'utc' });
    if (!start.isValid || !end.isValid) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'dateRange must use yyyy-MM-dd',
      });
    }
    if (end < start) {
      throw new BadRequestException({
        code: 'VALIDATION_ERROR',
        message: 'endDate must be >= startDate',
      });
    }
  }

  private toWizardInput(dto: CreateIcelandSelfDriveTripDto): IcelandSelfDriveWizardInput {
    const endLocationCode = dto.endSameAsStart
      ? dto.startLocationCode
      : dto.endLocationCode;

    return {
      destinationCode: 'IS',
      productLine: PRODUCT_LINE_ICELAND_SELF_DRIVE,
      dateRange: {
        startDate: dto.dateRange.startDate,
        endDate: dto.dateRange.endDate,
      },
      arrivalAt: dto.arrivalAt ?? null,
      departureAt: dto.departureAt ?? null,
      travelerCount: dto.travelerCount,
      startLocationCode: dto.startLocationCode,
      endLocationCode,
      endSameAsStart: dto.endSameAsStart,
      vehicleAcquisition: dto.vehicleAcquisition,
      regionIds: dto.regionIds ?? [],
      bookings: dto.bookings ?? [],
      skipBookings: dto.skipBookings ?? false,
      fillBookingsLater: dto.fillBookingsLater ?? false,
    };
  }

  private toExplorationInput(wizard: IcelandSelfDriveWizardInput): ExplorationInput {
    return {
      destinationCodes: ['IS'],
      dateRange: {
        startDate: wizard.dateRange.startDate,
        endDate: wizard.dateRange.endDate,
      },
      travelers: Array.from({ length: wizard.travelerCount }, () => ({
        type: 'ADULT' as const,
      })),
      mobilityContext: {
        vehicleType: '2WD_COMPACT_SUV',
      },
      rentalContext: {
        pickupLocation: LOCATION_PICKUP_CODES[wizard.startLocationCode],
      },
      source: 'USER_CREATED',
    };
  }
}
