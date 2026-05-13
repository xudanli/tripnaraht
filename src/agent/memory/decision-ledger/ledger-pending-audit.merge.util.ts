import type { DecisionLedgerSnapshot } from './decision-ledger.types';
import type { LedgerPendingAuditPayloadV1 } from './ledger-pending-audit.types';

export function mergePendingWorldAnchorsIntoLedger(
  ledger: DecisionLedgerSnapshot,
  pending: LedgerPendingAuditPayloadV1,
): DecisionLedgerSnapshot {
  return {
    ...ledger,
    anchors: {
      ...ledger.anchors,
      world: pending.anchors.world,
      worldLayered: pending.anchors.worldLayered,
    },
    worldSlices: pending.worldSlices,
  };
}
