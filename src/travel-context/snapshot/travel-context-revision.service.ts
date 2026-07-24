import { Injectable } from '@nestjs/common';
import type { TravelContextStage } from '../domain/travel-context.constants';
import {
  buildTravelContextSnapshotId,
  buildWorldStateVersionLabel,
  computeTravelContextRevision,
  type TravelContextRevisionInput,
} from '../domain/travel-context-revision';

/** Centralized revision computation — RFC-003 Phase 1 (禁止各模块自算). */
@Injectable()
export class TravelContextRevisionService {
  compute(input: TravelContextRevisionInput): number {
    return computeTravelContextRevision(input);
  }

  computeFromUpdatedAtMs(
    updatedAtMs: number,
    bindings?: Partial<Omit<TravelContextRevisionInput, 'updatedAtMs'>>,
  ): number {
    return computeTravelContextRevision({
      updatedAtMs,
      ...bindings,
    });
  }

  buildSnapshotId(contextId: string, revision: number): string {
    return buildTravelContextSnapshotId(contextId, revision);
  }

  buildWorldStateVersion(worldSnapshotId?: string): string {
    return buildWorldStateVersionLabel(worldSnapshotId);
  }

  explorationRevision(input: {
    updatedAt: Date;
    generationVersion?: number | null;
    stage: TravelContextStage;
    constraintsVersion?: number;
  }): number {
    return this.compute({
      updatedAtMs: input.updatedAt.getTime(),
      constraintsVersion: input.constraintsVersion ?? 0,
      generationVersion: input.generationVersion,
      stage: input.stage,
    });
  }
}
