/**
 * P-CI-4 skeleton — map readiness `pressure` + optional `runtimeSignals` → control knobs only (DAG/IR neutral).
 * Pair with `pressureRegulation` runtime path or use standalone from CI artifacts.
 */

import * as fs from 'fs';
import type { TripWorldState } from '../decision/world-model';
import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';

/** Minimal slice compatible with merge output `readiness-p1-report.json` → `pressure`. */
export interface PciPressure2 {
  physicsPressure: number;
  stability: number;
  tripsPressure?: number;
  entropyPressure?: number;
  coupling?: number;
  fusedPhysicsPressure?: number;
  fusedStability?: number;
}

export interface RuntimeSignals {
  ecoDriftRate?: number;
  identityRejectRate?: number;
  closureRetryRate?: number;
}

/** Narrow policy surface for Neptune retry (skeleton omits `block`; extend when wiring engine). */
export interface Pci4ControlSignal {
  ecoThrottle: number;
  identityGuardTighten: boolean;
  closureRetryLimit: number;
  neptuneRetryPolicy: 'allow' | 'restrict';
}

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function envFloat(name: string, fallback: number): number {
  if (typeof process === 'undefined' || process.env?.[name] === undefined) return fallback;
  const v = parseFloat(process.env[name]!);
  return Number.isFinite(v) ? v : fallback;
}

function resolvePolicyTuning(policy?: EcoClosurePolicy | null): {
  alpha: number;
  instabilityThreshold: number;
  riskThreshold: number;
} {
  const p = policy?.pci4PressureControl;
  return {
    alpha: p?.controlAlpha ?? envFloat('TRIP_PCI4_ALPHA', 0.35),
    instabilityThreshold:
      p?.instabilityThreshold ?? envFloat('TRIP_PCI4_INSTABILITY_THRESHOLD', 0.6),
    riskThreshold: p?.riskThreshold ?? envFloat('TRIP_PCI4_RISK_THRESHOLD', 0.7),
  };
}

function runtimeScalar(runtimeSignals?: RuntimeSignals): number {
  if (!runtimeSignals) return 0;
  const e = clamp(runtimeSignals.ecoDriftRate ?? 0, 0, 1);
  const i = clamp(runtimeSignals.identityRejectRate ?? 0, 0, 1);
  const c = clamp(runtimeSignals.closureRetryRate ?? 0, 0, 1);
  return clamp(0.4 * e + 0.3 * i + 0.3 * c, 0, 1);
}

/**
 * Derive control from P-CI merge `pressure` blob + optional runtime rates + policy/env tuning.
 */
export function computeControlSignal(
  pciPressure: PciPressure2,
  runtimeSignals?: RuntimeSignals,
  policy?: EcoClosurePolicy | null,
): Pci4ControlSignal {
  const fusedStability =
    pciPressure.fusedStability ??
    pciPressure.stability;
  const fusedPhysicsPressure =
    pciPressure.fusedPhysicsPressure ?? pciPressure.physicsPressure;

  const { alpha, instabilityThreshold, riskThreshold } = resolvePolicyTuning(policy);
  const runtimePressure = runtimeScalar(runtimeSignals);
  const fusedPressure = clamp(fusedPhysicsPressure + alpha * runtimePressure, 0, 1);

  let ecoThrottle = 1;
  let closureRetryLimit = 3;
  let identityGuardTighten = false;
  let neptuneRetryPolicy: 'allow' | 'restrict' = 'allow';

  if (fusedStability < instabilityThreshold || fusedPressure > riskThreshold) {
    ecoThrottle = clamp(1 - fusedPressure, 0.3, 1);
    closureRetryLimit = 1;
    identityGuardTighten = true;
    neptuneRetryPolicy = 'restrict';
  }

  return {
    ecoThrottle,
    closureRetryLimit,
    identityGuardTighten,
    neptuneRetryPolicy,
  };
}

/** Attach skeleton output for audit / downstream readers (does not mutate DAG/IR). */
export function applyControlSignal(state: TripWorldState, signal: Pci4ControlSignal): void {
  state.signals.controlSignal = signal;
}

/** Parse `pressure` object from merged readiness JSON (`scripts/ci/compute-system-pressure` output). */
export function extractPciPressure2FromReadinessDoc(doc: unknown): PciPressure2 | null {
  if (!doc || typeof doc !== 'object') return null;
  const root = doc as Record<string, unknown>;
  const p = root.pressure;
  if (!p || typeof p !== 'object') return null;
  const o = p as Record<string, unknown>;
  const physicsPressure = typeof o.physicsPressure === 'number' ? o.physicsPressure : NaN;
  const stability = typeof o.stability === 'number' ? o.stability : NaN;
  if (!Number.isFinite(physicsPressure) || !Number.isFinite(stability)) return null;

  const ro = o.runtimeOverlay;
  let fusedPhysicsPressure: number | undefined;
  let fusedStability: number | undefined;
  if (ro && typeof ro === 'object') {
    const r = ro as Record<string, unknown>;
    if (typeof r.fusedPhysicsPressure === 'number') fusedPhysicsPressure = r.fusedPhysicsPressure;
    if (typeof r.fusedStability === 'number') fusedStability = r.fusedStability;
  }

  return {
    physicsPressure,
    stability,
    ...(typeof o.tripsPressure === 'number' ? { tripsPressure: o.tripsPressure as number } : {}),
    ...(typeof o.entropyPressure === 'number' ? { entropyPressure: o.entropyPressure as number } : {}),
    ...(typeof o.coupling === 'number' ? { coupling: o.coupling as number } : {}),
    ...(fusedPhysicsPressure !== undefined ? { fusedPhysicsPressure } : {}),
    ...(fusedStability !== undefined ? { fusedStability } : {}),
  };
}

export function extractRuntimeSignalsFromReadinessDoc(doc: unknown): RuntimeSignals | undefined {
  if (!doc || typeof doc !== 'object') return undefined;
  const rs = (doc as Record<string, unknown>).runtimeSignals;
  if (!rs || typeof rs !== 'object') return undefined;
  const o = rs as Record<string, unknown>;
  const out: RuntimeSignals = {};
  if (typeof o.ecoDriftRate === 'number') out.ecoDriftRate = o.ecoDriftRate;
  if (typeof o.identityRejectRate === 'number') out.identityRejectRate = o.identityRejectRate;
  if (typeof o.closureRetryRate === 'number') out.closureRetryRate = o.closureRetryRate;
  return Object.keys(out).length ? out : undefined;
}

export function loadReadinessReportJson(path: string): unknown | null {
  try {
    if (!fs.existsSync(path)) return null;
    const raw = fs.readFileSync(path, 'utf8');
    return JSON.parse(raw) as unknown;
  } catch {
    return null;
  }
}

/** End-to-end: readiness path → compute → `signals.controlSignal`. */
export function applyControlSignalFromReadinessPath(
  state: TripWorldState,
  reportPath: string,
  policy?: EcoClosurePolicy | null,
): Pci4ControlSignal | null {
  const doc = loadReadinessReportJson(reportPath);
  if (!doc) return null;
  const pci = extractPciPressure2FromReadinessDoc(doc);
  if (!pci) return null;
  const rt = extractRuntimeSignalsFromReadinessDoc(doc);
  const signal = computeControlSignal(pci, rt, policy);
  applyControlSignal(state, signal);
  return signal;
}
