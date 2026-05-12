/**
 * P-CI-5 — Control stability field: runtime energies + gradient → regime (composition layer over P-CI-4).
 */

import type { EcoClosurePolicy } from '../execution-cognitive-orchestrator/execution-cognitive-orchestrator.types';
import type { Pci4ControlSignal, PciPressure2, RuntimeSignals } from './p-ci-4';
import { computeControlSignal } from './p-ci-4';

function clamp(x: number, lo: number, hi: number): number {
  if (!Number.isFinite(x)) return lo;
  return Math.min(hi, Math.max(lo, x));
}

export interface ControlEnergyState {
  ecoEnergy: number;
  identityEnergy: number;
  closureEnergy: number;
  systemEnergy: number;
  /** ΔE vs previous tick — convergence / oscillation probe. */
  stabilityGradient: number;
}

export type ControlRegime = 'STABLE' | 'OSCILLATING' | 'UNSTABLE' | 'CRITICAL';

export function computeControlEnergyField(input: {
  ecoDriftRate?: number;
  identityRejectRate?: number;
  closureRetryRate?: number;
  prev?: ControlEnergyState;
}): ControlEnergyState {
  const ecoEnergy = clamp(input.ecoDriftRate ?? 0, 0, 1);
  const identityEnergy = clamp(input.identityRejectRate ?? 0, 0, 1);
  const closureEnergy = clamp(input.closureRetryRate ?? 0, 0, 1);

  const systemEnergy = clamp(
    0.4 * ecoEnergy + 0.3 * identityEnergy + 0.3 * closureEnergy,
    0,
    1,
  );

  const prevEnergy =
    input.prev !== undefined ? input.prev.systemEnergy : systemEnergy;
  const stabilityGradient = systemEnergy - prevEnergy;

  return {
    ecoEnergy,
    identityEnergy,
    closureEnergy,
    systemEnergy,
    stabilityGradient,
  };
}

export function deriveControlRegime(state: ControlEnergyState): ControlRegime {
  const e = state.systemEnergy;
  const g = Math.abs(state.stabilityGradient);

  if (e < 0.3 && g < 0.05) return 'STABLE';
  if (e < 0.6 && g < 0.2) return 'OSCILLATING';
  if (e >= 0.6 && e < 0.85) return 'UNSTABLE';
  return 'CRITICAL';
}

/** P-CI-5 modifier on P-CI-4 output — does not replace rule surface. */
export function applyRegimeToControlSignal(
  signal: Pci4ControlSignal,
  regime: ControlRegime,
): Pci4ControlSignal {
  if (regime !== 'CRITICAL') {
    return { ...signal };
  }
  return {
    ...signal,
    ecoThrottle: clamp(signal.ecoThrottle * 0.5, 0.3, 1),
    neptuneRetryPolicy: 'restrict',
    closureRetryLimit: Math.min(signal.closureRetryLimit, 1),
    identityGuardTighten: true,
  };
}

/** Stack P-CI-4 rule surface + P-CI-5 energy/regime corrections (audit-friendly split). */
export function composePci4WithPci5EnergyLayer(
  pci: PciPressure2,
  runtime: RuntimeSignals | undefined,
  policy: EcoClosurePolicy | null | undefined,
  prevEnergy?: ControlEnergyState,
): {
  baseSignal: Pci4ControlSignal;
  signal: Pci4ControlSignal;
  energy: ControlEnergyState;
  regime: ControlRegime;
} {
  const energy = computeControlEnergyField({
    ecoDriftRate: runtime?.ecoDriftRate,
    identityRejectRate: runtime?.identityRejectRate,
    closureRetryRate: runtime?.closureRetryRate,
    prev: prevEnergy,
  });
  const regime = deriveControlRegime(energy);
  const baseSignal = computeControlSignal(pci, runtime, policy);
  const signal = applyRegimeToControlSignal(baseSignal, regime);
  return { baseSignal, signal, energy, regime };
}
