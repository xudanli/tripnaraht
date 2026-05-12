/**
 * P-CI-6 — Control phase transition field: energy + gradient → phase / transition pressure / momentum.
 * Layers on P-CI-5 (energy) + P-CI-4 (policy) without replacing lower tiers.
 */

import type {
  EcoClosurePolicy,
  EcoNeptuneClosureEvaluation,
} from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { TripWorldState } from '../decision/world-model';
import type { Pci4ControlSignal, PciPressure2, RuntimeSignals } from './p-ci-4';
import { derivePressureProxies } from './pressure-regulation';
import type {
  ClosurePressureHint,
  NeptuneRetryPolicySetting,
  PressureControlSignal,
} from './pressure-regulation.types';
import {
  composePci4WithPci5EnergyLayer,
  type ControlEnergyState,
  type ControlRegime,
} from './p-ci-5';

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

function envFloat(name: string, fallback: number): number {
  if (typeof process === 'undefined' || process.env?.[name] === undefined) return fallback;
  const v = parseFloat(process.env[name]!);
  return Number.isFinite(v) ? v : fallback;
}

function pci6EngineEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.TRIP_PCI6_ENGINE === '1';
}

function pci6OverrideEnabled(): boolean {
  return typeof process !== 'undefined' && process.env?.TRIP_PCI6_OVERRIDE === '1';
}

export type ControlPhase =
  | 'SUBCRITICAL'
  | 'CRITICAL_EDGE'
  | 'TRANSITIONAL'
  | 'SUPERCRITICAL';

export interface ControlPhaseState {
  phase: ControlPhase;
  energy: number;
  gradient: number;
  /** Combined pressure toward a phase boundary (bounded). */
  transitionPressure: number;
  /** Direction / aggressiveness of phase motion in [-1, 1]. */
  phaseMomentum: number;
}

export function computeControlPhaseState(input: {
  energy: number;
  gradient: number;
  /** Reserved for hysteresis / future use — does not affect v1 classification. */
  prevPhase?: ControlPhase;
}): ControlPhaseState {
  const e = input.energy;
  const g = input.gradient;

  const transitionPressure = Math.min(1, e + Math.abs(g) * 1.2);
  const phaseMomentum = clamp(g * 3, -1, 1);

  let phase: ControlPhase;
  if (transitionPressure < 0.3) {
    phase = 'SUBCRITICAL';
  } else if (transitionPressure < 0.55) {
    phase = 'CRITICAL_EDGE';
  } else if (transitionPressure < 0.8) {
    phase = 'TRANSITIONAL';
  } else {
    phase = 'SUPERCRITICAL';
  }

  return {
    phase,
    energy: e,
    gradient: g,
    transitionPressure,
    phaseMomentum,
  };
}

/** True when discrete phase label changed (event-like discontinuity in classification). */
export function isPhaseTransition(
  state: ControlPhaseState,
  prev: ControlPhaseState,
): boolean {
  return state.phase !== prev.phase;
}

/** Phase-layer overrides on an existing P-CI-4-shaped signal (typically post P-CI-5 regime pass). */
export function applyPhaseOverridesToControlSignal(
  signal: Pci4ControlSignal,
  phaseState: ControlPhaseState,
): Pci4ControlSignal {
  const out = { ...signal };

  if (phaseState.phase === 'SUPERCRITICAL') {
    out.ecoThrottle = Math.min(out.ecoThrottle, 0.2);
    out.neptuneRetryPolicy = 'restrict';
  }

  if (phaseState.phase === 'TRANSITIONAL') {
    out.identityGuardTighten = true;
  }

  return out;
}

/** Full stack: P-CI-4 → P-CI-5 regime overlay → P-CI-6 phase overlay + transition flag. */
export function composeControlWithPhaseTransitionLayer(
  pci: PciPressure2,
  runtime: RuntimeSignals | undefined,
  policy: EcoClosurePolicy | null | undefined,
  opts?: {
    prevEnergy?: ControlEnergyState;
    prevPhaseState?: ControlPhaseState;
  },
): {
  baseSignal: Pci4ControlSignal;
  signalAfterRegime: Pci4ControlSignal;
  signal: Pci4ControlSignal;
  energy: ControlEnergyState;
  regime: ControlRegime;
  phaseState: ControlPhaseState;
  phaseTransition: boolean;
} {
  const layer = composePci4WithPci5EnergyLayer(pci, runtime, policy, opts?.prevEnergy);
  const phaseState = computeControlPhaseState({
    energy: layer.energy.systemEnergy,
    gradient: layer.energy.stabilityGradient,
  });
  const signal = applyPhaseOverridesToControlSignal(layer.signal, phaseState);
  const phaseTransition =
    opts?.prevPhaseState !== undefined
      ? isPhaseTransition(phaseState, opts.prevPhaseState)
      : false;

  return {
    baseSignal: layer.baseSignal,
    signalAfterRegime: layer.signal,
    signal,
    energy: layer.energy,
    regime: layer.regime,
    phaseState,
    phaseTransition,
  };
}

/** Map closure evaluation + ledger edges → P-CI-5 runtime channels (deterministic, bounded). */
export function deriveRuntimeSignalsFromClosureEval(
  state: TripWorldState,
  closureEval: EcoNeptuneClosureEvaluation,
): RuntimeSignals {
  const edges = state.signals.identityRejectionEdges?.length ?? 0;
  return {
    ecoDriftRate: clamp(closureEval.ecoDriftScore, 0, 1),
    identityRejectRate: clamp(Math.min(1, edges / 10), 0, 1),
    closureRetryRate: clamp(1 - closureEval.semanticConvergence, 0, 1),
  };
}

/** Align PCI pressure blob with {@link derivePressureProxies} outputs. */
export function buildPciPressure2FromPressureProxies(proxies: {
  fusedStabilityProxy: number;
  fusedPhysicsPressureProxy: number;
}): PciPressure2 {
  const fp = clamp(proxies.fusedPhysicsPressureProxy, 0, 1);
  const fs = clamp(proxies.fusedStabilityProxy, 0, 1);
  return {
    physicsPressure: fp,
    stability: fs,
    fusedPhysicsPressure: fp,
    fusedStability: fs,
  };
}

function mergeNeptunePolicies(
  base: NeptuneRetryPolicySetting,
  phased: 'allow' | 'restrict',
): NeptuneRetryPolicySetting {
  if (base === 'block') return 'block';
  return phased === 'restrict' ? 'restrict' : base;
}

/**
 * Apply P-CI-6 phase tightening on top of existing {@link TripWorldState.signals.pressureRegulation}
 * (after {@link applyPressureRegulation}). Does not replace the PCI compose audit trail.
 */
export function mergePhaseIntoPressureRegulationControl(
  state: TripWorldState,
  phaseState: ControlPhaseState,
): void {
  const snap = state.signals.pressureRegulation;
  if (!snap?.enabled) return;

  const base = snap.control;
  const asPci4: Pci4ControlSignal = {
    ecoThrottle: base.ecoThrottle,
    identityGuardTighten: base.identityGuardTighten,
    closureRetryLimit: base.closureRetryLimit,
    neptuneRetryPolicy: base.neptuneRetryPolicy === 'block' ? 'restrict' : base.neptuneRetryPolicy,
  };
  const phased = applyPhaseOverridesToControlSignal(asPci4, phaseState);

  const merged: PressureControlSignal = {
    ecoThrottle: Math.min(base.ecoThrottle, phased.ecoThrottle),
    identityGuardTighten: base.identityGuardTighten || phased.identityGuardTighten,
    closureRetryLimit: Math.min(base.closureRetryLimit, phased.closureRetryLimit),
    neptuneRetryPolicy:
      base.neptuneRetryPolicy === 'block'
        ? 'block'
        : mergeNeptunePolicies(base.neptuneRetryPolicy, phased.neptuneRetryPolicy),
  };

  let mutationThresholdFactor = snap.mutationThresholdFactor;
  const tighten = envFloat('TRIP_PRESSURE_GUARD_TIGHTEN_FACTOR', 0.85);
  if (
    (phaseState.phase === 'TRANSITIONAL' || phaseState.phase === 'SUPERCRITICAL') &&
    phased.identityGuardTighten
  ) {
    mutationThresholdFactor = Math.min(mutationThresholdFactor, tighten);
  }

  state.signals.pressureRegulation = {
    ...snap,
    control: merged,
    mutationThresholdFactor,
  };
}

export interface ApplyControlPhaseEngineTickResult {
  applied: boolean;
  /** True when phase overlay was merged into `pressureRegulation.control`. */
  overrideApplied: boolean;
  phaseTransition: boolean;
}

/**
 * Decision-engine hook: P-CI-4 → P-CI-5 → P-CI-6 audit fields on `signals`.
 *
 * - `TRIP_PCI6_ENGINE=1` — compute and record `controlEnergyState`, `controlRegime`, `controlPhaseState`,
 *   `controlPhaseTransition`, and `controlSignal` (P-CI-5 path only unless override).
 * - `TRIP_PCI6_OVERRIDE=1` — additionally merge phase tightening onto `pressureRegulation.control`
 *   (call **after** {@link applyPressureRegulation}).
 */
export function applyControlPhaseEngineTick(
  state: TripWorldState,
  closureEval: EcoNeptuneClosureEvaluation,
  closureHint?: ClosurePressureHint,
): ApplyControlPhaseEngineTickResult {
  if (!pci6EngineEnabled()) {
    return { applied: false, overrideApplied: false, phaseTransition: false };
  }

  const proxies = derivePressureProxies(state, closureHint);
  const pci = buildPciPressure2FromPressureProxies(proxies);
  const runtime = deriveRuntimeSignalsFromClosureEval(state, closureEval);
  const policy = state.policies?.ecoClosure ?? null;

  const out = composeControlWithPhaseTransitionLayer(pci, runtime, policy, {
    prevEnergy: state.signals.controlEnergyState,
    prevPhaseState: state.signals.controlPhaseState,
  });

  state.signals.controlEnergyState = out.energy;
  state.signals.controlRegime = out.regime;
  state.signals.controlPhaseState = out.phaseState;
  state.signals.controlPhaseTransition = out.phaseTransition;

  if (pci6OverrideEnabled()) {
    state.signals.controlSignal = out.signal;
  } else {
    state.signals.controlSignal = out.signalAfterRegime;
  }

  let overrideApplied = false;
  if (pci6OverrideEnabled()) {
    const hadReg = state.signals.pressureRegulation?.enabled === true;
    mergePhaseIntoPressureRegulationControl(state, out.phaseState);
    overrideApplied = hadReg;
  }

  return {
    applied: true,
    overrideApplied,
    phaseTransition: out.phaseTransition,
  };
}
