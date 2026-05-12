/**
 * Inventory Reality v1 — time-stamped supply signals for planning SSOT (L3).
 *
 * Attach on {@link import('../world-model').ActivityCandidate.supplySnapshot}.
 * Narrative layers should treat `observed_at` + `source` as honesty bits (cache vs live API).
 */

export const INVENTORY_REALITY_SCHEMA = 'tripnara/inventory-reality/v1' as const;

export type InventorySupplyKind = 'hotel_room' | 'rental_car' | 'tour_slot' | 'activity_ticket' | 'other';

export type InventorySupplySource =
  | 'provider_api'
  | 'aggregator_api'
  | 'cache'
  | 'heuristic'
  | 'unknown';

/**
 * Structured availability — complements coarse `inventoryRisk` (1–5) on the same candidate.
 */
export interface InventorySupplySnapshotV1 {
  schema: typeof INVENTORY_REALITY_SCHEMA;
  kind: InventorySupplyKind;
  /** ISO 8601 — when this snapshot was observed (required for temporal decisions) */
  observed_at: string;
  /** 0 = abundant … 1 = critical scarcity / likely sell-out */
  supply_risk: number;
  /** Remaining bookable units when provider exposes it */
  remaining_units?: number;
  /** Last sharp price move — optional audit for "price jump risk" narratives */
  last_price_jump_at?: string;
  /** Observed or quoted price (product layer may use separate Money type later) */
  price_hint?: { amount: number; currency: string };
  source: InventorySupplySource;
  /**
   * True when API partial / stale TTL / fallback heuristic — same dual-reality guard as travel-time.
   */
  degraded?: boolean;
  /** Provider correlation id for support / replay */
  provider_ref?: string;
}

export function isInventorySupplySnapshotV1(value: unknown): value is InventorySupplySnapshotV1 {
  if (!value || typeof value !== 'object') return false;
  const o = value as Record<string, unknown>;
  return (
    o.schema === INVENTORY_REALITY_SCHEMA &&
    typeof o.kind === 'string' &&
    typeof o.observed_at === 'string' &&
    typeof o.supply_risk === 'number' &&
    typeof o.source === 'string'
  );
}

export function clampSupplyRisk01(x: number): number {
  if (Number.isNaN(x)) return 1;
  return Math.min(1, Math.max(0, x));
}
