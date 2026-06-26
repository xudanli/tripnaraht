/** Loop Engineering feature flags (Phase 2). */

export function isLoopAutoTriggerEnabled(): boolean {
  return process.env.LOOP_AUTO_TRIGGER_ENABLED === 'true';
}

export function isInTripLoopAutoTriggerEnabled(): boolean {
  return process.env.IN_TRIP_LOOP_AUTO_TRIGGER_ENABLED === 'true';
}

export function loopTriggerCooldownMs(): number {
  const raw = process.env.LOOP_TRIGGER_COOLDOWN_MS;
  const parsed = raw ? parseInt(raw, 10) : 300_000;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 300_000;
}

export function loopAutoTriggerOnPlanning(): boolean {
  return process.env.LOOP_AUTO_TRIGGER_ON_PLANNING !== 'false';
}

export function isDecisionLearningLoopEnabled(): boolean {
  return process.env.DECISION_LEARNING_LOOP_ENABLED === 'true';
}

export function isTripCompletedLearningEnabled(): boolean {
  return process.env.LOOP_TRIP_COMPLETED_LEARNING_ENABLED === 'true';
}

export function tripCompletedLearningLimit(): number {
  const raw = process.env.LOOP_TRIP_COMPLETED_LEARNING_LIMIT;
  const parsed = raw ? parseInt(raw, 10) : 50;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 50;
}
