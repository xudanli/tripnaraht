import type { ActivityCandidate } from '../world-model';
import {
  clampSupplyRisk01,
  INVENTORY_REALITY_SCHEMA,
  type InventorySupplySnapshotV1,
} from './inventory-reality.types';

/**
 * Attach supply snapshot to a candidate immutably (planning pool enrichment).
 */
export function mergeSupplySnapshotIntoCandidate(
  candidate: ActivityCandidate,
  snapshot: InventorySupplySnapshotV1,
): ActivityCandidate {
  const supply_risk = clampSupplyRisk01(snapshot.supply_risk);
  return {
    ...candidate,
    supplySnapshot: {
      ...snapshot,
      schema: INVENTORY_REALITY_SCHEMA,
      supply_risk,
    },
  };
}

/**
 * Derive legacy 1–5 `inventoryRisk` from continuous supply_risk when unset.
 * Optional helper for code paths that still read the coarse scalar only.
 */
export function inventoryRiskBandFromSupplyRisk(supplyRisk01: number): 1 | 2 | 3 | 4 | 5 {
  const x = clampSupplyRisk01(supplyRisk01);
  if (x < 0.2) return 1;
  if (x < 0.4) return 2;
  if (x < 0.6) return 3;
  if (x < 0.8) return 4;
  return 5;
}

/** Inverse mapping for legacy 1–5 inventoryRisk → continuous supply_risk (placeholder enrichment). */
export function supplyRisk01FromInventoryRiskBand(r: 1 | 2 | 3 | 4 | 5): number {
  const map: Record<number, number> = {
    1: 0.12,
    2: 0.32,
    3: 0.55,
    4: 0.78,
    5: 0.92,
  };
  return map[r] ?? 0.55;
}
