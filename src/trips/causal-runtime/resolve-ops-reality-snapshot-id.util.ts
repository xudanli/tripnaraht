import type { TripWorldState } from '../decision/world-model';
import { findCausalityRecord } from '../reality-kernel/decision-causality';

/** Resolve P-OPS-2 snapshot id from causality chain outcome link. */
export function resolveOpsRealitySnapshotId(
  state: TripWorldState | undefined,
  causalityId?: string,
): string | undefined {
  if (!state?.signals) return undefined;
  const cid = causalityId?.trim() || state.signals.lastDecisionCausalityId?.trim();
  if (!cid) return undefined;
  const row = findCausalityRecord(state, cid);
  return row?.outcome?.ops_reality_snapshot_id?.trim() || undefined;
}
