import type { TripWorldState } from '../decision/world-model';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';
import { buildEcoIdentityGuardSnapshot } from './identity-guard';
import { isEcoLedgerDbPersistenceSkipped } from './eco-ledger-db-policy';

export interface EcoLedgerHydrateBundle {
  ledger?: EcoIdentityLedgerSnapshot;
  /** Mirrors `Trip.metadata.ecoIdentityLedgerRevision` (default 0). */
  revision: number;
}

/**
 * Load ledger + revision from storage when `ecoLedgerTripId` is set.
 * Revision is always applied (CAS)；ledger is filled only when memory has none.
 */
export async function hydrateEcoLedgerIntoTripWorldState(
  state: TripWorldState,
  loadBundle: (tripId: string) => Promise<EcoLedgerHydrateBundle>,
): Promise<void> {
  if (isEcoLedgerDbPersistenceSkipped()) return;
  const tripId = state.signals.ecoLedgerTripId;
  if (!tripId) return;
  const { ledger, revision } = await loadBundle(tripId);
  state.signals.ecoLedgerMetadataRevision = revision;
  if (ledger && !state.signals.ecoIdentityLedger) {
    state.signals.ecoIdentityLedger = ledger;
  }
  if (state.signals.ecoIdentityLedger?.ecoIdentityLineage) {
    state.signals.ecoIdentityGuardSnapshot = buildEcoIdentityGuardSnapshot(state);
  }
}
