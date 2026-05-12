import { randomUUID } from 'crypto';
import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { TripWorldState } from '../decision/world-model';
import type { EcoIdentityLedgerSnapshot } from './eco-identity-ledger.types';

export function attachEcoIdentityLineageToAcceptedLedger(
  state: TripWorldState,
  ledger: EcoIdentityLedgerSnapshot,
  policy?: EcoClosurePolicy | null,
): void {
  const prevSnap = state.signals.ecoIdentityGuardSnapshot;
  const branchId =
    policy?.identityLineage?.branchId ?? prevSnap?.branchId ?? 'main';
  const parentLedgerId = prevSnap?.ledgerId;
  const depth =
    prevSnap?.ledgerId === undefined ? 0 : (prevSnap.depth ?? 0) + 1;

  ledger.ecoIdentityLineage = {
    ledgerId: randomUUID(),
    ...(parentLedgerId !== undefined ? { parentLedgerId } : {}),
    branchId,
    depth,
  };
}
