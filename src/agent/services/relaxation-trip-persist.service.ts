import { Injectable, Logger, Optional } from '@nestjs/common';
import { ApplyRelaxationConstraintsService } from '../../trips/trip-constraint-solver/services/apply-relaxation-constraints.service';
import { RELAXATION_WRITABLE_PERSIST_ACTION_IDS } from '../utils/relaxation-constraint-write.util';
import type { AppliedRelaxation } from './clarification-handler.service';

export type RelaxationTripPersistResult = {
  persisted: boolean;
  constraintsVersion?: number;
  actionIds: string[];
};

@Injectable()
export class RelaxationTripPersistService {
  private readonly logger = new Logger(RelaxationTripPersistService.name);

  constructor(
    @Optional() private readonly applyRelaxation?: ApplyRelaxationConstraintsService,
  ) {}

  resolvePersistableActionIds(applied: AppliedRelaxation[]): string[] {
    return [...new Set(applied.map((a) => a.id).filter((id) => RELAXATION_WRITABLE_PERSIST_ACTION_IDS.has(id)))];
  }

  async persistFromIntake(
    tripId: string,
    userId: string,
    applied: AppliedRelaxation[],
  ): Promise<RelaxationTripPersistResult | undefined> {
    const actionIds = this.resolvePersistableActionIds(applied);
    if (actionIds.length === 0 || !tripId.trim()) return undefined;
    if (!this.applyRelaxation) {
      this.logger.warn('[RelaxationTripPersist] ApplyRelaxationConstraintsService 未注入，跳过 trip 持久化');
      return { persisted: false, actionIds };
    }

    try {
      const result = await this.applyRelaxation.applyRelaxation(tripId, userId, {
        actionIds,
        source: 'clarification_submit',
      });
      return {
        persisted: true,
        constraintsVersion: result.constraintsVersion,
        actionIds,
      };
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      this.logger.warn(`[RelaxationTripPersist] trip=${tripId} persist failed: ${msg}`);
      return { persisted: false, actionIds };
    }
  }
}
