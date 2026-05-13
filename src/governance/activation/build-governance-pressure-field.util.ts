import type { GovernanceLedgerEvent } from '../../agent/ledger/governance-ledger.types';
import type { GovernancePressureField } from './governance-activation.types';

const WINDOW_MS = 1000 * 60 * 60 * 48;

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

/**
 * Lightweight runtime pressure view from recent ledger tail (v1 linear blend).
 */
export function buildGovernancePressureField(events: readonly GovernanceLedgerEvent[], now = Date.now()): GovernancePressureField {
  const recent = events.filter((e) => now - e.timestamp <= WINDOW_MS);
  let w = 0;
  let p = 0;
  let x = 0;
  let r = 0;
  for (const e of recent) {
    const age = 1 - Math.min(1, (now - e.timestamp) / WINDOW_MS);
    const wgt = 0.35 + 0.65 * age;
    if (e.eventLevel === 'L3_world') w += wgt;
    if (e.eventLevel === 'L2_policy') p += wgt;
    if (e.eventLevel === 'L1_operational') {
      if (e.eventType === 'recovery_suggested') r += wgt;
      else x += wgt;
    }
  }
  const norm = (v: number) => clamp01(v / Math.max(6, recent.length * 0.45));
  return {
    worldPressure: norm(w),
    weather: norm(w),
    policyPressure: norm(p),
    executionPressure: norm(x),
    recoveryPressure: norm(r),
  };
}
