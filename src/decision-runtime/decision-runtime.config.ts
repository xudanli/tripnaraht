/**
 * Decision Runtime feature flags (PRD §21.5).
 */
export function isDecisionRuntimeReadFromProjectionEnabled(): boolean {
  return process.env.DECISION_RUNTIME_READ_FROM_PROJECTION === 'true';
}

export function isDecisionRuntimeDualWriteEnabled(): boolean {
  return process.env.DECISION_RUNTIME_DUAL_WRITE !== 'false';
}

export function isRuntimeReplayValidationEnabled(): boolean {
  return process.env.RUNTIME_REPLAY_VALIDATION === 'true';
}

/** Auto-create shell Trip when Gate1 project has no linkedTripId (Tier 0.3). Default ON. */
export function isGate1LinkedTripAutoCreateEnabled(): boolean {
  return process.env.GATE1_LINKED_TRIP_AUTO_CREATE !== 'false';
}

/** Sync Trip.status from Gate1 experimentStatus (Tier 1.3). Default ON. */
export function isGate1TripStatusSyncEnabled(): boolean {
  return process.env.GATE1_TRIP_STATUS_SYNC !== 'false';
}

/** Stage Gate1 runtime events in outbox before travel_events publish (Tier 1.2). Default OFF. */
export function isRuntimeEventOutboxEnabled(): boolean {
  return process.env.RUNTIME_EVENT_OUTBOX_ENABLED === 'true';
}
