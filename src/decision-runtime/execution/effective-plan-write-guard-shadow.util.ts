/**
 * In-memory ring buffer for EFFECTIVE_PLAN_WRITE_GUARD=SHADOW bypass observations (Phase 1 ramp).
 */

export type EffectivePlanWriteGuardShadowEventV1 = {
  schemaId: 'tripnara.effective_plan_write_guard_shadow@v1';
  at: string;
  caller: string;
  wouldBlock: true;
};

const MAX_EVENTS = 200;
const events: EffectivePlanWriteGuardShadowEventV1[] = [];

export function recordEffectivePlanWriteGuardShadowBypass(caller?: string): void {
  events.push({
    schemaId: 'tripnara.effective_plan_write_guard_shadow@v1',
    at: new Date().toISOString(),
    caller: caller?.trim() || 'unknown',
    wouldBlock: true,
  });
  if (events.length > MAX_EVENTS) {
    events.splice(0, events.length - MAX_EVENTS);
  }
}

export function getRecentEffectivePlanWriteGuardShadowEvents(limit = 50): {
  total: number;
  events: EffectivePlanWriteGuardShadowEventV1[];
} {
  const n = Math.min(Math.max(Math.floor(limit), 1), MAX_EVENTS);
  return {
    total: events.length,
    events: events.slice(-n),
  };
}

export function resetEffectivePlanWriteGuardShadowEventsForTests(): void {
  events.length = 0;
}
