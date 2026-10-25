/**
 * Production entry: POI authority re-observe → tick materialization.
 */

import { Injectable, Logger, Optional } from '@nestjs/common';
import {
  materializePoiAuthorityForDecisionTick,
} from './poi-authority-bridge';
import { DecisionTickPoiBindingStore } from './decision-tick-poi-binding.store';
import {
  PoiAccessOverrideAuthorityPort,
  type PoiAuthorityPort,
} from './poi-access-override-authority.port';
import type { DecisionTickPoiMaterialization } from './poi-authority-bridge.types';
import {
  buildPoiSuspectedClosedHint,
  type PoiSuspectedClosedHint,
} from './poi-authority-bridge.types';

export interface TriggerPoiAuthorityTickInput {
  tripId: string;
  poiId: string;
  tickId?: string;
  fieldHint?: PoiSuspectedClosedHint;
  /** Convenience when only observation id is known */
  observationId?: string;
  suspectedAt?: string;
}

@Injectable()
export class PoiAuthorityDecisionTickService {
  private readonly logger = new Logger(PoiAuthorityDecisionTickService.name);

  constructor(
    private readonly bindingStore: DecisionTickPoiBindingStore,
    @Optional()
    private readonly authorityPort?: PoiAccessOverrideAuthorityPort,
  ) {}

  async maybeTriggerForPoi(
    input: TriggerPoiAuthorityTickInput,
  ): Promise<DecisionTickPoiMaterialization | null> {
    const poiId = input.poiId.trim().toLowerCase();
    if (!poiId) return null;

    const port: PoiAuthorityPort | undefined = this.authorityPort;
    if (!port) {
      this.logger.warn(
        `POI authority port missing trip=${input.tripId} poi=${poiId}`,
      );
      return null;
    }

    const fieldHint =
      input.fieldHint ??
      (input.observationId
        ? buildPoiSuspectedClosedHint({
            tripId: input.tripId,
            poiId,
            observationId: input.observationId,
            suspectedAt: input.suspectedAt,
          })
        : undefined);

    const tickId =
      input.tickId ??
      `poi_tick_${input.tripId}_${poiId}`.slice(0, 120);

    const authority = await port.resolveAuthority({
      tripId: input.tripId,
      poiId,
      correlationId: `poi_trigger_${tickId}`,
    });

    const materialization = materializePoiAuthorityForDecisionTick({
      tickId,
      tripId: input.tripId,
      poiId,
      authority,
      fieldHint,
    });

    this.bindingStore.put(materialization);

    const sv = materialization.sourceVersion;
    this.logger.log(
      `POI→Authority tick=${tickId} poi=${poiId} status=${materialization.poiStatus} gate=${materialization.gateDisposition} version=${sv.version} evidenceId=${sv.evidenceId} canonical=wmc=gate sourceVersion YES`,
    );

    return materialization;
  }

  listBindings(tripId: string): DecisionTickPoiMaterialization[] {
    return this.bindingStore.listForTrip(tripId);
  }

  getLatest(tripId: string): DecisionTickPoiMaterialization | undefined {
    return this.bindingStore.getLatest(tripId);
  }
}
