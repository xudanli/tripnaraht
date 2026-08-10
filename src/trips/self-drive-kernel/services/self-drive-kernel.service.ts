import { Injectable } from '@nestjs/common';
import { ConstraintSolverAccessService } from '../../trip-constraint-solver/services/constraint-solver-access.service';
import { buildSelfDriveContext } from '../builders/build-self-drive-context';
import type { SelfDriveContext } from '../contracts/self-drive-context.types';
import type { SelfDriveEnginesResult } from '../contracts/self-drive-engines.types';
import { runSelfDriveEngines } from '../engines/run-self-drive-engines';
import {
  projectSelfDriveDailyDrive,
  type SelfDriveDailyDriveProjection,
} from '../projectors/project-self-drive-daily-drive';

export interface SelfDriveKernelBundle {
  context: SelfDriveContext;
  engines: SelfDriveEnginesResult;
  dailyDrive: SelfDriveDailyDriveProjection;
}

@Injectable()
export class SelfDriveKernelService {
  constructor(private readonly access: ConstraintSolverAccessService) {}

  async assertAndLoadTrip(tripId: string, userId: string) {
    return this.access.assertTripMember(tripId, userId);
  }

  buildBundle(input: {
    tripId: string;
    destination: string | null;
    metadata: unknown;
    startDate?: Date | null;
    endDate?: Date | null;
    localDate?: string;
    timezone?: string;
    dayIndex?: number;
  }): SelfDriveKernelBundle {
    const context = buildSelfDriveContext({
      tripId: input.tripId,
      destination: input.destination || 'UNKNOWN',
      metadata: input.metadata,
      startDate: input.startDate,
      endDate: input.endDate,
      localDate: input.localDate,
      timezone: input.timezone,
      dayIndex: input.dayIndex,
    });
    const engines = runSelfDriveEngines(context);
    const dailyDrive = projectSelfDriveDailyDrive(context, engines);
    return { context, engines, dailyDrive };
  }

  async getBundleForTrip(
    tripId: string,
    userId: string,
    opts?: { dayIndex?: number; localDate?: string },
  ): Promise<SelfDriveKernelBundle> {
    const trip = await this.assertAndLoadTrip(tripId, userId);
    return this.buildBundle({
      tripId,
      destination: trip.destination,
      metadata: trip.metadata,
      startDate: trip.startDate,
      endDate: trip.endDate,
      dayIndex: opts?.dayIndex,
      localDate: opts?.localDate,
    });
  }
}
