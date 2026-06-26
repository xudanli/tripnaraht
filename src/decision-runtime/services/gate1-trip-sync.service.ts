import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { Gate1ProjectStatus } from '../../gate1/constants/gate1.constants';
import { TripStatus, normalizeTripStatus } from '../../trips/dto/trip-status.dto';
import { TravelEventPersistenceService } from '../../trips/event-store/travel-event-persistence.service';
import { buildTravelEventEnvelope } from '../../trips/event-store/travel-event-envelope.builder';
import { buildTripStateChangedIdempotencyKey } from '../../trips/event-store/travel-event-idempotency.util';
import {
  TravelEventSource,
  TravelEventType,
  TrajectorySegment,
} from '../../trips/event-store/types/travel-event.types';
import { suggestTripStatusForGate1 } from '../types/gate1-status-mapping';
import { isGate1TripStatusSyncEnabled } from '../decision-runtime.config';

export interface Gate1TripSyncResult {
  synced: boolean;
  skippedReason?: string;
  tripId?: string;
  previousStatus?: string;
  newStatus?: string;
  eventPersisted?: boolean;
}

@Injectable()
export class Gate1TripSyncService {
  private readonly logger = new Logger(Gate1TripSyncService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly persistence: TravelEventPersistenceService,
  ) {}

  /**
   * Sync Trip.status from Gate1 experimentStatus (M0 §2 mapping).
   * Fail-open: never throws to Gate1 callers.
   */
  async syncFromGate1Transition(input: {
    projectId: string;
    fromExperimentStatus: Gate1ProjectStatus;
    toExperimentStatus: Gate1ProjectStatus;
    actorUserId?: string;
  }): Promise<Gate1TripSyncResult> {
    if (!isGate1TripStatusSyncEnabled()) {
      return { synced: false, skippedReason: 'SYNC_DISABLED' };
    }

    try {
      const project = await this.prisma.gate1Project.findUnique({
        where: { id: input.projectId },
        select: { linkedTripId: true },
      });

      if (!project?.linkedTripId) {
        return { synced: false, skippedReason: 'NO_LINKED_TRIP' };
      }

      const trip = await this.prisma.trip.findUnique({
        where: { id: project.linkedTripId },
        select: { id: true, status: true, metadata: true },
      });

      if (!trip) {
        return { synced: false, skippedReason: 'TRIP_NOT_FOUND', tripId: project.linkedTripId };
      }

      const targetStatus = suggestTripStatusForGate1(input.toExperimentStatus);
      const currentStatus = normalizeTripStatus(trip.status);

      if (currentStatus === targetStatus) {
        return {
          synced: false,
          skippedReason: 'ALREADY_ALIGNED',
          tripId: trip.id,
          previousStatus: currentStatus,
          newStatus: targetStatus,
        };
      }

      const timestamp = new Date().toISOString();
      const previousStatus = trip.status ?? TripStatus.DRAFT;

      await this.prisma.trip.update({
        where: { id: trip.id },
        data: {
          status: targetStatus,
          updatedAt: new Date(),
          metadata: {
            ...((trip.metadata as Record<string, unknown> | null) ?? {}),
            gate1Sync: {
              projectId: input.projectId,
              fromExperimentStatus: input.fromExperimentStatus,
              toExperimentStatus: input.toExperimentStatus,
              syncedAt: timestamp,
            },
          },
        },
      });

      const idempotencyKey = buildTripStateChangedIdempotencyKey({
        tripId: trip.id,
        previousStatus,
        newStatus: targetStatus,
        timestamp,
        userId: input.actorUserId,
      });

      const envelope = buildTravelEventEnvelope({
        tripId: trip.id,
        segment: TrajectorySegment.STATE,
        eventType: TravelEventType.TRIP_LIFECYCLE_STATE_CHANGED,
        source: TravelEventSource.TRIP_LIFECYCLE,
        payload: {
          previousStatus,
          newStatus: targetStatus,
          gate1ProjectId: input.projectId,
          gate1ExperimentStatus: input.toExperimentStatus,
          syncSource: 'gate1_experiment_status',
        },
        userId: input.actorUserId,
        timestamp,
        metadata: {
          gate1ProjectId: input.projectId,
          gate1FromStatus: input.fromExperimentStatus,
          gate1ToStatus: input.toExperimentStatus,
        },
        idempotencyKey,
      });

      const persistResult = await this.persistence.persist(envelope);

      this.logger.log(
        `[Gate1TripSync] ${trip.id}: ${previousStatus} → ${targetStatus} (gate1 ${input.fromExperimentStatus} → ${input.toExperimentStatus})`,
      );

      return {
        synced: true,
        tripId: trip.id,
        previousStatus,
        newStatus: targetStatus,
        eventPersisted: persistResult.persisted,
      };
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(
        `[Gate1TripSync] Failed for project ${input.projectId}: ${message}`,
      );
      return { synced: false, skippedReason: 'ERROR', tripId: undefined };
    }
  }
}
