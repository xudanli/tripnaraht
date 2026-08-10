/**
 * Persist Look field observations as non-authoritative WorldState assertions.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import { WorldStateStoreService } from '../../guardian-decision-core/evidence/world-state-store.service';
import type { WorldStateSnapshot } from '../../guardian-decision-core/contracts/world-state.types';
import type {
  ObservationAssessment,
  TravelObservationEvent,
  VerificationStatus,
} from '../observation.types';
import {
  buildLookWorldStateAssertions,
  LOOK_FIELD_OBSERVATION_PREDICATE,
  type LookFieldObservationPayload,
} from './project-look-to-world-state';
import type { WorldStateAssertion } from '../../guardian-decision-core/contracts/world-state.types';

export interface LookWorldStateProjectionResult {
  assertionIds: string[];
  snapshotId?: string;
  snapshot?: WorldStateSnapshot;
  skipped: boolean;
  reason?: string;
}

@Injectable()
export class LookWorldStateAssertionService {
  private readonly logger = new Logger(LookWorldStateAssertionService.name);

  constructor(
    @Optional() private readonly worldStateStore?: WorldStateStoreService,
  ) {}

  get enabled(): boolean {
    return !!this.worldStateStore;
  }

  async projectFromObservation(input: {
    event: TravelObservationEvent;
    verificationStatus: VerificationStatus;
    assessment?: Pick<
      ObservationAssessment,
      'assessmentId' | 'assessmentRevision'
    >;
  }): Promise<LookWorldStateProjectionResult> {
    if (!this.worldStateStore) {
      return { assertionIds: [], skipped: true, reason: 'NO_WORLD_STATE_STORE' };
    }

    const drafts = buildLookWorldStateAssertions(input);
    if (drafts.length === 0) {
      return { assertionIds: [], skipped: true, reason: 'NO_FACTS' };
    }

    // Safety: never write road.status
    for (const a of drafts) {
      if (a.predicate !== LOOK_FIELD_OBSERVATION_PREDICATE) {
        throw new Error(`Look assertion predicate forbidden: ${a.predicate}`);
      }
      if (a.payload.authoritative !== false) {
        throw new Error('Look assertion must set authoritative=false');
      }
      if (a.source.sourceType !== 'USER' || a.source.provider !== 'NARA_LOOK') {
        throw new Error('Look assertion must use USER / NARA_LOOK provenance');
      }
    }

    const assertionIds: string[] = [];
    let snapshot: WorldStateSnapshot | undefined;

    for (const draft of drafts) {
      const result = await this.worldStateStore.appendAssertion(
        input.event.tripId,
        draft as WorldStateAssertion,
      );
      assertionIds.push(result.assertion.assertionId);
      snapshot = result.snapshot;
    }

    this.logger.debug(
      `Look WorldState project trip=${input.event.tripId} obs=${input.event.observationId} assertions=${assertionIds.length} snapshot=${snapshot?.snapshotId ?? 'none'}`,
    );

    return {
      assertionIds,
      snapshotId: snapshot?.snapshotId,
      snapshot,
      skipped: false,
    };
  }

  /** Read-back helper for tests / diagnostics */
  async listLookAssertions(
    tripId: string,
  ): Promise<WorldStateAssertion<LookFieldObservationPayload>[]> {
    if (!this.worldStateStore) return [];
    const store = await this.worldStateStore.readStore(tripId);
    return store.assertions.filter(
      (a): a is WorldStateAssertion<LookFieldObservationPayload> =>
        a.predicate === LOOK_FIELD_OBSERVATION_PREDICATE,
    );
  }
}
