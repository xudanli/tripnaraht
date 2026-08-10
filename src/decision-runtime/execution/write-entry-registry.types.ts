/**
 * P0 — Unified write-entry registry types.
 * Catalogs every path that can mutate formal trip/plan objects.
 */

export type WriteObjectKind =
  | 'Trip'
  | 'TripDay'
  | 'ItineraryItem'
  | 'HotelAnchor'
  | 'TripStatus'
  | 'BookingStatus'
  | 'PlanVersion';

export type WriteEntryTrigger = 'Route' | 'Event' | 'Cron' | 'Internal' | 'Agent';

/** Disposition decided in P0 write-path freeze. */
export type WriteEntryDisposition =
  /** Only via EffectivePlanWriteGuard + EffectivePlanWriter + EffectivePlanVersionStore */
  | 'FORMAL_CHAIN'
  /** Must hold write authority (or be blocked when write chain on) */
  | 'REQUIRE_GUARD'
  /** Closed for C-end; Internal Admin / env bypass only */
  | 'ADMIN_ONLY'
  /** Direct apply closed; proposal → apply only */
  | 'PROPOSAL_ONLY'
  /** Legacy path default-closed */
  | 'LEGACY_CLOSED'
  /** Allowed metadata / prep-only (non-itinerary) */
  | 'ALLOW_METADATA'
  /** Explicitly blocked */
  | 'BLOCK';

export interface WriteEntryRecord {
  id: string;
  objects: WriteObjectKind[];
  trigger: WriteEntryTrigger;
  /** HTTP route, event name, or cron id */
  surface: string;
  service: string;
  usesGuard: boolean;
  writesPlanVersion: boolean;
  writesLedger: boolean;
  owner: string;
  disposition: WriteEntryDisposition;
  notes?: string;
}
