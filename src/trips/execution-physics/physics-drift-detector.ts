import type { PhysicsObservationHistory } from './physics-history.types';
import type { PhysicsDriftSignal } from './execution-physics.types';

function mean(xs: number[]): number {
  return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0;
}

export function detectTimeModelMismatch(history: PhysicsObservationHistory): PhysicsDriftSignal | null {
  const skews = history.entries.map(e => e.timeSkew ?? 0).filter(x => x > 0);
  const m = mean(skews);
  if (m > 0.25) {
    return {
      kind: 'TIME_MODEL_MISMATCH',
      severity: Math.min(1, m),
      detail: `Mean time skew ${m.toFixed(3)} exceeds linear-time assumption.`,
    };
  }
  return null;
}

export function detectCausalityViolation(history: PhysicsObservationHistory): PhysicsDriftSignal | null {
  const rate = history.entries.filter(e => e.causalConflict).length / Math.max(1, history.entries.length);
  if (rate > 0.15) {
    return {
      kind: 'CAUSALITY_VIOLATION',
      severity: Math.min(1, rate + 0.2),
      detail: `Causal conflict rate ${rate.toFixed(3)} suggests non-strict causality.`,
    };
  }
  return null;
}

export function detectStateCollapseInstability(history: PhysicsObservationHistory): PhysicsDriftSignal | null {
  const jit = history.entries.map(e => e.collapseJitters ?? 0);
  const m = mean(jit);
  if (m > 1.2) {
    return {
      kind: 'STATE_COLLAPSE_INSTABILITY',
      severity: Math.min(1, m / 3),
      detail: `Collapse jitter mean ${m.toFixed(2)} — projection unstable.`,
    };
  }
  return null;
}

export function detectPhysicsDrift(
  executionHistory: PhysicsObservationHistory,
): PhysicsDriftSignal[] {
  const out: PhysicsDriftSignal[] = [];
  const a = detectTimeModelMismatch(executionHistory);
  const b = detectCausalityViolation(executionHistory);
  const c = detectStateCollapseInstability(executionHistory);
  if (a) {
    out.push(a);
  }
  if (b) {
    out.push(b);
  }
  if (c) {
    out.push(c);
  }
  return out;
}
