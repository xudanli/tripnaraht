/**
 * Feature flags for Phase 3 Reality Enforcement (incremental rollout).
 */

import type { RealityReadPolicy } from './reality-read-policy.types';

export function isRealityEnforcementEnabled(): boolean {
  const v = String(process.env.REALITY_ENFORCEMENT ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** `REALITY_READ_BOUNDARY=1` — adapter-level ingress checks (e.g. ALS + audit). */
export function isRealityReadBoundaryEnabled(): boolean {
  const v = String(process.env.REALITY_READ_BOUNDARY ?? '').trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** `REALITY_READ_POLICY`: SNAPSHOT_ONLY | SNAPSHOT_PREFERRED | LIVE_OVERRIDE_ALLOWED */
export function getDefaultRealityReadPolicy(): RealityReadPolicy {
  const p = String(process.env.REALITY_READ_POLICY ?? '').trim().toUpperCase();
  if (p === 'SNAPSHOT_ONLY' || p === 'LIVE_OVERRIDE_ALLOWED') return p;
  return 'SNAPSHOT_PREFERRED';
}

/** How hard to treat adapter reads that bypass bound DecisionContext when audit/boundary is on. */
export type RealityBypassEscalation = 'warn' | 'error' | 'block';

/** `REALITY_BYPASS_ESCALATION`: warn (default) | error | block */
export function getRealityBypassEscalation(): RealityBypassEscalation {
  const v = String(process.env.REALITY_BYPASS_ESCALATION ?? '').trim().toLowerCase();
  if (v === 'error' || v === 'block') return v;
  return 'warn';
}
