/**
 * Governance for world reads vs Snapshot authority (Phase 3 — Reality Read Boundary).
 */

export type RealityReadPolicy =
  /** Hard barrier: adapters must not fetch live world without snapshot binding */
  | 'SNAPSHOT_ONLY'
  /** Default migration path: prefer snapshot; live allowed with audit */
  | 'SNAPSHOT_PREFERRED'
  /** Emergency / ops: live OK — must still emit audit + optional new snapshot */
  | 'LIVE_OVERRIDE_ALLOWED';

export const DEFAULT_REALITY_READ_POLICY: RealityReadPolicy = 'SNAPSHOT_PREFERRED';
