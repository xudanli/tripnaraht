/**
 * Minimal history slice for nullification metrics — map from engine logs / memory.
 */

export interface NullificationHistoryEntry {
  /** Last execution succeeded without escalation. */
  success?: boolean;
  /** Stable bucket id for decision variance — slot fingerprint / digest fragment. */
  decisionFingerprint?: string;
  /** Repair layer fired this tick. */
  repairEvent?: boolean;
}
