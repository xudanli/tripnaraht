import type { TripWorldState } from '../decision/world-model';

/**
 * Resolve Prisma trip id into `signals.ecoLedgerTripId` (first non-empty wins):
 * existing signal → `policies.ecoClosure.boundTripId` → `context.tripId`.
 */
export function applyEcoLedgerTripContext(state: TripWorldState): void {
  if (state.signals.ecoLedgerTripId) return;
  const id = state.policies?.ecoClosure?.boundTripId ?? state.context.tripId;
  if (id) {
    state.signals.ecoLedgerTripId = id;
  }
}
