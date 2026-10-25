/**
 * Tick-scoped orchestrator: Look hint → authority port → decision materialization.
 *
 * Does NOT establish global bidirectional sync.
 * Does NOT let Look write road.status.
 * Caller supplies authority result (typically EvidenceResolver.resolveRoadStatusChanged
 * or UNAVAILABLE when fetch fails).
 */

import {
  materializeLookRoadAuthorityForDecisionTick,
} from './look-road-authority-bridge';
import type {
  AuthorityRoadResolveOutcome,
  DecisionTickRoadMaterialization,
  LookRoadSuspectedClosedHint,
} from './look-road-authority-bridge.types';
import { buildLookRoadSuspectedClosedHint } from './look-road-authority-bridge.types';

export type LookRoadAuthorityPort = {
  /**
   * Re-observe road via official/partner source.
   * Must NOT use Look payload as authoritative status.
   * Return UNAVAILABLE on timeout / missing service — never invent OPEN/CLOSED.
   */
  resolveAuthority(input: {
    tripId: string;
    roadId: string;
    segmentId?: string;
    correlationId?: string;
  }): Promise<AuthorityRoadResolveOutcome>;
};

/**
 * Full P0-1 tick path (pure orchestration; persistence left to caller).
 */
export async function runLookRoadAuthorityDecisionTick(input: {
  tickId: string;
  look: {
    lookObservationId: string;
    roadId: string;
    tripId: string;
    segmentId?: string;
    suspectedAt?: string;
  };
  authorityPort: LookRoadAuthorityPort;
}): Promise<{
  lookHint: LookRoadSuspectedClosedHint;
  materialization: DecisionTickRoadMaterialization;
}> {
  const lookHint = buildLookRoadSuspectedClosedHint(input.look);
  const authority = await input.authorityPort.resolveAuthority({
    tripId: lookHint.tripId,
    roadId: lookHint.roadId,
    segmentId: lookHint.segmentId,
    correlationId: `look_trigger_${lookHint.lookObservationId}`,
  });
  const materialization = materializeLookRoadAuthorityForDecisionTick({
    tickId: input.tickId,
    lookHint,
    authority,
  });
  return { lookHint, materialization };
}
