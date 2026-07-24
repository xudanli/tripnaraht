/**
 * Slice 3 E1 — execution departure observation persistence.
 */

import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import { toInputJsonValue } from '../../budget-os/utils/prisma-json.util';
import type {
  ExecutionDepartureObservation,
  ExecutionDepartureSource,
} from '../contracts/execution-slip.types';

const METADATA_KEY = 'executionDepartureObservations';

export interface RecordDepartureObservationInput {
  tripId: string;
  planVersionId: string;
  activityId: string;
  plannedDepartAt: string;
  observedAt: string;
  stillAtPoi: boolean;
  source: ExecutionDepartureSource;
  recordedBy?: string;
  idempotencyKey?: string;
}

@Injectable()
export class ExecutionDepartureObservationStoreService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    input: RecordDepartureObservationInput,
  ): Promise<ExecutionDepartureObservation> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: input.tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const existing = (meta[METADATA_KEY] ?? {}) as Record<
      string,
      ExecutionDepartureObservation
    >;

    if (input.idempotencyKey && existing[input.idempotencyKey]) {
      return existing[input.idempotencyKey];
    }

    const observationId =
      input.idempotencyKey ?? `obs_${input.activityId}_${Date.now()}`;

    const observation: ExecutionDepartureObservation = {
      observationId,
      tripId: input.tripId,
      planVersionId: input.planVersionId,
      activityId: input.activityId,
      plannedDepartAt: input.plannedDepartAt,
      observedAt: input.observedAt,
      stillAtPoi: input.stillAtPoi,
      source: input.source,
      recordedAt: new Date().toISOString(),
      recordedBy: input.recordedBy,
    };

    existing[observationId] = observation;

    await this.prisma.trip.update({
      where: { id: input.tripId },
      data: {
        metadata: toInputJsonValue({
          ...meta,
          [METADATA_KEY]: existing,
        }),
      },
    });

    return observation;
  }

  async getById(
    tripId: string,
    observationId: string,
  ): Promise<ExecutionDepartureObservation | null> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const store = (meta[METADATA_KEY] ?? {}) as Record<
      string,
      ExecutionDepartureObservation
    >;
    return store[observationId] ?? null;
  }

  async listForTrip(tripId: string): Promise<ExecutionDepartureObservation[]> {
    const trip = await this.prisma.trip.findUnique({
      where: { id: tripId },
      select: { metadata: true },
    });
    const meta = (trip?.metadata ?? {}) as Record<string, unknown>;
    const store = (meta[METADATA_KEY] ?? {}) as Record<
      string,
      ExecutionDepartureObservation
    >;
    return Object.values(store);
  }
}
