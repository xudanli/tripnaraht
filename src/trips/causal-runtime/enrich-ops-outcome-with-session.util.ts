import type { CausalRuntimeSessionSnapshot } from './causal-runtime-session.types';
import { asWorldStateRecord } from './coerce-trip-world-state.util';
import { resolveOpsRealitySnapshotId } from './resolve-ops-reality-snapshot-id.util';

export interface OpsOutcomeSessionEnrichmentInput {
  tripId?: string;
  causality_id?: string;
  state?: Record<string, unknown>;
  snapshotId?: string;
}

export interface OpsOutcomeSessionEnrichmentResult extends OpsOutcomeSessionEnrichmentInput {
  stateAutoFilled?: boolean;
  causalityAutoFilled?: boolean;
  snapshotAutoFilled?: boolean;
}

/**
 * Fill missing OPS / P5 join keys from server-side causal session (Agent layer cache).
 */
export function enrichOpsOutcomeWithSession(
  input: OpsOutcomeSessionEnrichmentInput,
  session: CausalRuntimeSessionSnapshot | null | undefined,
): OpsOutcomeSessionEnrichmentResult {
  const tripId = input.tripId?.trim() || session?.tripId;
  const causality_id = input.causality_id?.trim() || session?.lastDecisionCausalityId;
  const hasClientState = Boolean(input.state?.['context']);
  const state = hasClientState ? input.state : asWorldStateRecord(session?.state);

  const snapshotFromState = resolveOpsRealitySnapshotId(
    session?.state,
    causality_id,
  );
  const snapshotId =
    input.snapshotId?.trim() ||
    session?.opsRealitySnapshotId ||
    snapshotFromState;

  return {
    ...input,
    tripId,
    causality_id,
    state,
    snapshotId,
    ...( !hasClientState && session?.state ? { stateAutoFilled: true } : {}),
    ...( !input.causality_id?.trim() && session?.lastDecisionCausalityId
      ? { causalityAutoFilled: true }
      : {}),
    ...( !input.snapshotId?.trim() && (session?.opsRealitySnapshotId || snapshotFromState)
      ? { snapshotAutoFilled: true }
      : {}),
  };
}
