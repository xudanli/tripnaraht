/**
 * P-CI-4 — derive / ingest pressure control and attach to TripWorldState.signals (no DAG/IR mutation).
 */

import * as fs from 'fs';
import type { TripWorldState } from '../decision/world-model';
import type {
  ClosurePressureHint,
  PressureControlSignal,
  PressureRegulationSnapshot,
} from './pressure-regulation.types';

const DEFAULT_CONTROL: PressureControlSignal = {
  ecoThrottle: 1,
  identityGuardTighten: false,
  closureRetryLimit: 3,
  neptuneRetryPolicy: 'allow',
};

function clamp01(x: number): number {
  if (!Number.isFinite(x)) return 0;
  return Math.min(1, Math.max(0, x));
}

function parseEnvFloat(name: string, fallback: number): number {
  if (typeof process === 'undefined' || !process.env?.[name]) return fallback;
  const v = parseFloat(process.env[name]!);
  return Number.isFinite(v) ? v : fallback;
}

export function isPressureRegulationEnabled(): boolean {
  if (typeof process === 'undefined') return false;
  return (
    process.env.TRIP_SELF_REGULATE_PRESSURE === '1' || process.env.TRIP_P_CI_4 === '1'
  );
}

function loadControlFromEnvJson(): PressureControlSignal | null {
  const p = typeof process !== 'undefined' ? process.env?.TRIP_PRESSURE_CONTROL_JSON : undefined;
  if (!p || !fs.existsSync(p)) return null;
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const j = JSON.parse(raw) as Partial<PressureControlSignal>;
    if (
      typeof j.ecoThrottle !== 'number' ||
      typeof j.identityGuardTighten !== 'boolean' ||
      typeof j.closureRetryLimit !== 'number' ||
      (j.neptuneRetryPolicy !== 'allow' &&
        j.neptuneRetryPolicy !== 'restrict' &&
        j.neptuneRetryPolicy !== 'block')
    ) {
      return null;
    }
    return {
      ecoThrottle: clamp01(j.ecoThrottle),
      identityGuardTighten: j.identityGuardTighten,
      closureRetryLimit: Math.max(0, Math.floor(j.closureRetryLimit)),
      neptuneRetryPolicy: j.neptuneRetryPolicy,
    };
  } catch {
    return null;
  }
}

/**
 * Deterministic proxies from last orchestration digest / trajectory (no ML).
 */
export function derivePressureProxies(
  state: TripWorldState,
  closureHint?: ClosurePressureHint,
): {
  fusedStabilityProxy: number;
  instabilityRiskProxy: number;
  fusedPhysicsPressureProxy: number;
} {
  const traj = state.signals.ecoOrchestrationDigest?.trajectory;
  const closureStability =
    closureHint !== undefined
      ? closureHint.stabilityScore
      : state.signals.ecoOrchestrationDigest?.ecoClosure?.final?.stabilityScore;

  let fusedStabilityProxy = 1;
  if (typeof closureStability === 'number' && Number.isFinite(closureStability)) {
    fusedStabilityProxy = clamp01(closureStability);
  } else if (traj?.normalizedScore !== undefined) {
    fusedStabilityProxy = clamp01(traj.normalizedScore);
  }

  let instabilityRiskProxy = 0;
  if (traj?.normalizedScore !== undefined) {
    instabilityRiskProxy = clamp01(1 - traj.normalizedScore);
  } else if (typeof closureStability === 'number') {
    instabilityRiskProxy = clamp01(1 - clamp01(closureStability));
  }

  let fusedPhysicsPressureProxy = 0;
  if (traj?.totalCost !== undefined) {
    fusedPhysicsPressureProxy = clamp01(traj.totalCost / 12);
  }

  return { fusedStabilityProxy, instabilityRiskProxy, fusedPhysicsPressureProxy };
}

function deriveControlFromProxies(
  fusedStabilityProxy: number,
  instabilityRiskProxy: number,
  fusedPhysicsPressureProxy: number,
): { control: PressureControlSignal; mutationThresholdFactor: number } {
  const alpha = parseEnvFloat('TRIP_PRESSURE_REG_ALPHA', 0.35);
  const stabilityLow = parseEnvFloat('TRIP_PRESSURE_STABILITY_LOW', 0.6);
  const riskHigh = parseEnvFloat('TRIP_PRESSURE_INSTABILITY_HIGH', 0.7);
  const tightenFactor = parseEnvFloat('TRIP_PRESSURE_GUARD_TIGHTEN_FACTOR', 0.85);

  const stress =
    fusedStabilityProxy < stabilityLow || instabilityRiskProxy > riskHigh;

  if (stress) {
    const ecoThrottle = Math.max(0.3, 1 - fusedPhysicsPressureProxy * alpha);
    return {
      control: {
        ecoThrottle: clamp01(ecoThrottle),
        identityGuardTighten: true,
        closureRetryLimit: 1,
        neptuneRetryPolicy: 'restrict',
      },
      mutationThresholdFactor: tightenFactor,
    };
  }

  return {
    control: {
      ecoThrottle: 1,
      identityGuardTighten: false,
      closureRetryLimit: 3,
      neptuneRetryPolicy: 'allow',
    },
    mutationThresholdFactor: 1,
  };
}

/**
 * Attach regulation snapshot to state.signals. Idempotent values for a frozen digest; safe to call each tick.
 */
export function applyPressureRegulation(
  state: TripWorldState,
  closureHint?: ClosurePressureHint,
): PressureRegulationSnapshot {
  const at = new Date().toISOString();

  if (!isPressureRegulationEnabled()) {
    const snap: PressureRegulationSnapshot = {
      appliedAt: at,
      enabled: false,
      source: 'disabled',
      control: { ...DEFAULT_CONTROL },
      mutationThresholdFactor: 1,
    };
    state.signals.pressureRegulation = snap;
    return snap;
  }

  const jsonControl = loadControlFromEnvJson();
  if (jsonControl) {
    const snap: PressureRegulationSnapshot = {
      appliedAt: at,
      enabled: true,
      source: 'env_json',
      control: jsonControl,
      mutationThresholdFactor: jsonControl.identityGuardTighten
        ? parseEnvFloat('TRIP_PRESSURE_GUARD_TIGHTEN_FACTOR', 0.85)
        : 1,
    };
    state.signals.pressureRegulation = snap;
    return snap;
  }

  const proxies = derivePressureProxies(state, closureHint);
  const { control, mutationThresholdFactor } = deriveControlFromProxies(
    proxies.fusedStabilityProxy,
    proxies.instabilityRiskProxy,
    proxies.fusedPhysicsPressureProxy,
  );

  const snap: PressureRegulationSnapshot = {
    appliedAt: at,
    enabled: true,
    source: 'derived',
    fusedStabilityProxy: proxies.fusedStabilityProxy,
    instabilityRiskProxy: proxies.instabilityRiskProxy,
    fusedPhysicsPressureProxy: proxies.fusedPhysicsPressureProxy,
    control,
    mutationThresholdFactor,
  };
  state.signals.pressureRegulation = snap;
  return snap;
}
