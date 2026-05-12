/**
 * P10 — counterfactual execution plans over the same structural IR / bytecode VM.
 */

import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { ExecutionBytecodeProgram } from '../execution-vm/execution-bytecode.types';
import type { ExecutionVMOutcome } from '../execution-vm/execution-vm';

export interface ExecutionSimulationPlan {
  baseIR: ExecutionIR;
  variants: ExecutionVariant[];
}

export interface ExecutionVariant {
  id: string;
  perturbation: ExecutionVariantPerturbation;
}

export interface ExecutionVariantPerturbation {
  /** Relative weather stress proxy applied to TRAVERSE edge costs (e.g. 0.05 = +5%). */
  weatherShift?: number;
  /** Road / friction noise on traversal costs. */
  roadNoise?: number;
  /** Global delay bias on traversal costs. */
  delayBias?: number;
  /** Maps to deterministic multipliers on simulated edge stress. */
  repairStrategy?: 'conservative' | 'aggressive' | 'minimal';
}

export interface ExecutionSimulationRunResult {
  variantId: string;
  variant: ExecutionVariant;
  irRun: {
    ok: boolean;
    pathCost: number;
    failures: string[];
  };
  outcome: ExecutionVMOutcome;
  program: ExecutionBytecodeProgram;
}

export interface SimulationDiffReport {
  bestVariantId: string;
  bestScore: number;
  scoresByVariantId: Record<string, number>;
  regretByVariantId: Record<string, number>;
  divergencePoints: SimulationDivergencePoint[];
}

export interface SimulationDivergencePoint {
  variantA: string;
  variantB: string;
  traceIndex: number;
  detail: string;
}
