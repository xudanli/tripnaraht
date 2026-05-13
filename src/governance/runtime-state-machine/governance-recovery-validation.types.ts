/** Recovery Validation Layer (RVL) — decides whether GRSM may exit RECOVERING toward NORMAL. */
export interface GovernanceRecoveryValidation {
  valid: boolean;
  remainingRisks: string[];
  unresolvedConstraints: string[];
  recommendedRuntimeState: 'RECOVERING' | 'RESTRICTED' | 'NORMAL';
}

export interface GovernanceRecoveryValidationInput {
  /** Generated itinerary (corridor refs on DRIVE / segment items when present). */
  itineraryDays?: ReadonlyArray<{
    items?: ReadonlyArray<{ metadata?: { route_segment_ref?: string } }>;
  }>;
  /** Snapshot `latestWorldRisks` or explicit world hints still considered active. */
  activeWorldRiskHints?: string[];
  /** Snapshot `activeRestrictions` at validation time. */
  snapshotActiveRestrictions?: string[];
  /** Corridor segment refs that must not appear while still in recovery (policy-derived). */
  bannedCorridorRefs?: string[];
}
