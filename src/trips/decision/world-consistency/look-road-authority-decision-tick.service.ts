/**
 * Production entry: Look assessment → authority re-observe → tick materialization.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import type { ObservationFact } from '../../travel-observation/observation.types';
import { tryBuildLookRoadSuspectedClosedHint } from './extract-look-road-closed-hint.util';
import { DecisionTickRoadBindingStore } from './decision-tick-road-binding.store';
import { EvidenceResolverLookRoadAuthorityPort } from './evidence-resolver-look-road-authority.port';
import { runLookRoadAuthorityDecisionTick } from './run-look-road-authority-decision-tick';
import type { DecisionTickRoadMaterialization } from './look-road-authority-bridge.types';

export interface TriggerLookRoadAuthorityTickInput {
  tripId: string;
  observationId: string;
  facts: ObservationFact[];
  segmentId?: string;
  fallbackRoadId?: string;
  suspectedAt?: string;
  /** Defaults to look_tick_{observationId} */
  tickId?: string;
}

@Injectable()
export class LookRoadAuthorityDecisionTickService {
  private readonly logger = new Logger(
    LookRoadAuthorityDecisionTickService.name,
  );

  constructor(
    private readonly bindingStore: DecisionTickRoadBindingStore,
    @Optional()
    private readonly authorityPort?: EvidenceResolverLookRoadAuthorityPort,
  ) {}

  /**
   * If Look facts hint suspected closed, trigger authority resolve and bind tick.
   * No-op when no hint / no road id / no authority port.
   */
  async maybeTriggerFromLookObservation(
    input: TriggerLookRoadAuthorityTickInput,
  ): Promise<DecisionTickRoadMaterialization | null> {
    const hint = tryBuildLookRoadSuspectedClosedHint({
      lookObservationId: input.observationId,
      tripId: input.tripId,
      facts: input.facts,
      segmentId: input.segmentId,
      fallbackRoadId: input.fallbackRoadId,
      suspectedAt: input.suspectedAt,
    });
    if (!hint) return null;

    if (!this.authorityPort) {
      this.logger.warn(
        `Look road hint present but authority port missing obs=${input.observationId}`,
      );
      return null;
    }

    const tickId =
      input.tickId ?? `look_tick_${input.observationId}`.slice(0, 120);

    const { materialization } = await runLookRoadAuthorityDecisionTick({
      tickId,
      look: {
        lookObservationId: hint.lookObservationId,
        roadId: hint.roadId,
        tripId: hint.tripId,
        segmentId: hint.segmentId,
        suspectedAt: hint.suspectedAt,
      },
      authorityPort: this.authorityPort,
    });

    this.bindingStore.put(materialization);

    const sv = materialization.sourceVersion;
    this.logger.log(
      `Look→Authority tick=${tickId} road=${materialization.roadId} status=${materialization.roadStatus} gate=${materialization.gateDisposition} version=${sv.version} evidenceId=${sv.evidenceId} abu=cgus=gate sourceVersion YES`,
    );

    return materialization;
  }

  getLatestBinding(tripId: string): DecisionTickRoadMaterialization | undefined {
    return this.bindingStore.getLatest(tripId);
  }

  getLatestFullBinding(tripId: string) {
    return this.bindingStore.getLatestBinding(tripId);
  }
}
