import type { TripWorldState } from '../world-model';
import { INVENTORY_REALITY_SCHEMA, type InventorySupplySnapshotV1 } from './inventory-reality.types';
import {
  mergeSupplySnapshotIntoCandidate,
  supplyRisk01FromInventoryRiskBand,
} from './inventory-candidate-merge';

/**
 * Attach degraded inventory snapshots for lodging candidates when no live API ran.
 * Keeps SSOT honest via `degraded: true` + `source: heuristic`.
 */
export function enrichTripWorldStateInventoryPlaceholders(
  state: TripWorldState,
  observedAtIso?: string,
): void {
  const observed_at = observedAtIso ?? new Date().toISOString();
  const dates = Object.keys(state.candidatesByDate ?? {});
  for (const date of dates) {
    const list = state.candidatesByDate[date];
    if (!list?.length) continue;
    state.candidatesByDate[date] = list.map((c) => {
      if (c.supplySnapshot) return c;
      if (c.type !== 'hotel') return c;

      const supply_risk =
        c.inventoryRisk != null
          ? supplyRisk01FromInventoryRiskBand(c.inventoryRisk)
          : 0.55;

      const snap: InventorySupplySnapshotV1 = {
        schema: INVENTORY_REALITY_SCHEMA,
        kind: 'hotel_room',
        observed_at,
        supply_risk,
        source: 'heuristic',
        degraded: true,
      };
      return mergeSupplySnapshotIntoCandidate(c, snap);
    });
  }
}
