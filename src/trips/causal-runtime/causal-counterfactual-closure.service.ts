import { Injectable, Logger, Optional } from '@nestjs/common';
import type { TripWorldState } from '../decision/world-model';
import { findCausalityRecord } from '../reality-kernel/decision-causality';
import { TravelEventPersistenceService } from '../event-store/travel-event-persistence.service';
import type { CausalOutcomeObservation } from './counterfactual/causal-counterfactual.types';
import { extractCausalObservationFromOpsOutcome } from './counterfactual/extract-causal-observation-from-ops-outcome.util';
import { isCausalCounterfactualOnOpsOutcomeEnabled } from './counterfactual/causal-counterfactual-kernel.config';
import type { OpsRealityOutcomePayloadV1 } from '../decision/observability/ops-reality-audit-payload';
import type { CausalCounterfactualReport } from './counterfactual/causal-counterfactual.types';
import { applyCounterfactualClosureToWorldState } from './counterfactual/apply-counterfactual-to-world-state';
import { runCausalCounterfactualClosure } from './counterfactual/run-causal-counterfactual-closure';
import { buildCounterfactualTravelEventEnvelope } from './travel-event-counterfactual.builder';

export interface CausalCounterfactualCloseInput {
  state: TripWorldState;
  causalityId: string;
  observation: CausalOutcomeObservation;
  tripId?: string;
  requestId?: string;
  userId?: string;
}

export interface CausalCounterfactualCloseResult {
  report: CausalCounterfactualReport;
  travelEventPersisted: boolean;
  travelEventId?: string;
}

/**
 * P5 — Observe actual outcome → compare to prediction → revise calibration → emit RESULT event.
 */
@Injectable()
export class CausalCounterfactualClosureService {
  private readonly logger = new Logger(CausalCounterfactualClosureService.name);

  constructor(
    @Optional() private readonly travelEventPersistence?: TravelEventPersistenceService,
  ) {}

  async closeLoop(input: CausalCounterfactualCloseInput): Promise<CausalCounterfactualCloseResult | null> {
    const record = findCausalityRecord(input.state, input.causalityId);
    if (!record) {
      this.logger.warn(`[P5] causality_id not found: ${input.causalityId}`);
      return null;
    }

    const report = runCausalCounterfactualClosure({
      record,
      observation: input.observation,
      priorCalibration: input.state.signals.icelandCausalCalibration,
      reflectiveModelBefore: input.state.signals.reflectiveCausalModel,
    });

    if (!report) {
      this.logger.warn(`[P5] insufficient metrics for counterfactual: ${input.causalityId}`);
      return null;
    }

    applyCounterfactualClosureToWorldState(input.state, report);

    const tripId =
      input.tripId?.trim() ||
      input.state.context.tripId?.trim() ||
      report.trip_id?.trim();
    let travelEventPersisted = false;
    let travelEventId: string | undefined;

    if (tripId && this.travelEventPersistence?.isEnabled()) {
      try {
        const envelope = buildCounterfactualTravelEventEnvelope({
          tripId,
          report,
          requestId: input.requestId,
          userId: input.userId,
        });
        const result = await this.travelEventPersistence.persist(envelope);
        travelEventPersisted = result.persisted;
        travelEventId = result.eventId;
        if (result.persisted) {
          this.logger.debug(
            `[P5] counterfactual travel_event causality_id=${report.causality_id} drift=${report.drift.severity}`,
          );
        }
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        this.logger.warn(`[P5] travel_event emit failed: ${message}`);
      }
    }

    return { report, travelEventPersisted, travelEventId };
  }

  /**
   * P5 + P-OPS-2 bridge — after outcome backfill, close counterfactual when state + causality_id available.
   * Fail-open: returns null when disabled, metrics missing, or chain row not found.
   */
  async tryCloseFromOpsOutcome(input: {
    state: TripWorldState;
    causalityId: string;
    outcome: OpsRealityOutcomePayloadV1;
    tripId?: string;
    requestId?: string;
  }): Promise<CausalCounterfactualCloseResult | null> {
    if (!isCausalCounterfactualOnOpsOutcomeEnabled()) return null;

    const observation = extractCausalObservationFromOpsOutcome(input.outcome);
    if (!observation) {
      this.logger.debug(
        `[P5/OPS] skip counterfactual — no causal_observation in outcome extensions causality=${input.causalityId}`,
      );
      return null;
    }

    return this.closeLoop({
      state: input.state,
      causalityId: input.causalityId,
      observation,
      tripId: input.tripId,
      requestId: input.requestId,
    });
  }
}
