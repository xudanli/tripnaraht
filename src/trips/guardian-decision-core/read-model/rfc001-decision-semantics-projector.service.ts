/**
 * WP4 — project RFC-001 Decision Ledger → V1.5 decisionSemantics (single writer, no dual SSOT).
 */

import { Injectable, Logger } from '@nestjs/common';
import { DecisionRecordStoreService } from '../../decision-semantics/persistence/decision-record.store';
import type { DecisionRecord } from '../../decision-semantics/types/decision-semantics.types';
import type { TripMutationSet } from '../../decision-semantics/types/decision-semantics.types';
import type { Rfc001DecisionRecord } from '../contracts/decision-record.types';
import { bridgeRfc001RecordToV15Mirror } from '../adapters/decision-center-bridge.adapter';
import { isRfc001V15ProjectionEnabled } from '../config/rfc001-iceland.config';
import { buildPlanVersionIdempotencyKey } from '../plan-version/plan-version.service';
import { buildRoadSegmentUnavailableSemanticKey } from '../../../decision-capabilities/road-unavailable/road-unavailable.semantic';

export interface ProjectRfc001DecisionInput {
  tripId: string;
  record: Rfc001DecisionRecord;
  actualMutation?: TripMutationSet;
  semanticKey?: string;
  markProblemResolved?: boolean;
}

@Injectable()
export class Rfc001DecisionSemanticsProjectorService {
  private readonly logger = new Logger(Rfc001DecisionSemanticsProjectorService.name);

  constructor(private readonly decisionRecordStore: DecisionRecordStoreService) {}

  isEnabled(): boolean {
    return isRfc001V15ProjectionEnabled();
  }

  async upsertFromRfcRecord(
    input: ProjectRfc001DecisionInput,
  ): Promise<DecisionRecord | undefined> {
    if (!this.isEnabled()) return undefined;

    const mirrored = bridgeRfc001RecordToV15Mirror(input.record, input.tripId, {
      actualMutation: input.actualMutation,
      tripVersionAfter: input.record.effectivePlanVersionId,
    });

    const existing = await this.decisionRecordStore.getRecord(
      input.tripId,
      input.record.decisionId,
    );

    let projected: DecisionRecord;
    if (existing) {
      projected = (await this.decisionRecordStore.updateRecord(
        input.tripId,
        input.record.decisionId,
        mirrored,
      ))!;
    } else {
      projected = await this.decisionRecordStore.appendRecord(
        input.tripId,
        mirrored,
        {
          ledgerCausality: {
            [`rfc001:decision:${input.record.decisionId}`]: input.record.decisionId,
          },
        },
      );
    }

    if (input.markProblemResolved && input.semanticKey) {
      await this.decisionRecordStore.markProblemResolved(input.tripId, {
        problemId: input.record.problemId,
        semanticKey: input.semanticKey,
        resolvedAt: new Date().toISOString(),
        resolvedByDecisionId: input.record.decisionId,
        resolvedTripVersion:
          input.record.effectivePlanVersionId ?? input.record.basePlanVersionId,
        resolution: 'DECISION_EXECUTED',
      });
    }

    this.logger.debug(
      `project trip=${input.tripId} decision=${input.record.decisionId} status=${mirrored.status}`,
    );

    return projected;
  }

  async getProjectedRecord(
    tripId: string,
    decisionId: string,
  ): Promise<DecisionRecord | undefined> {
    if (!this.isEnabled()) return undefined;
    return this.decisionRecordStore.getRecord(tripId, decisionId);
  }

  buildSemanticKey(problemId: string, triggerEventId?: string): string {
    return triggerEventId
      ? buildRoadSegmentUnavailableSemanticKey(triggerEventId)
      : `rfc001:problem:${problemId}`;
  }

  buildIdempotencyKey(tripId: string, decisionId: string): string {
    return buildPlanVersionIdempotencyKey(tripId, decisionId);
  }
}
