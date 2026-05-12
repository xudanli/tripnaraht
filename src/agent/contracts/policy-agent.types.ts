/**
 * Multi-Agent Policy Ecosystem (MAPE) — population of compiled ECPS policies ("policy agents",
 * not LLM agents) competing under selection + evolution operators.
 */

import type { ExecutionPolicyIR } from './execution-policy-ir.types';

/** Unified fitness vector — typically updated from ETK aggregates (`computeFitnessFromExecutionTraces`). */
export interface PolicyFitness {
  successRate: number;
  latency: number;
  replayStability: number;
  anomalyResistance: number;
  domainCoverage: number;
}

export type PolicySpecializationTag =
  | 'GENERAL'
  | 'SYSTEM1_OPTIMAL'
  | 'SYSTEM2_REASONING'
  | 'LOW_LATENCY'
  | 'HIGH_RELIABILITY'
  | 'REPLAY_SAFE'
  | 'EXPLORATION';

export interface PolicySpecialization {
  primary: PolicySpecializationTag;
  tags: PolicySpecializationTag[];
}

/**
 * One deployable policy entity in the population (genome = compiled `ExecutionPolicyIR`).
 */
export interface PolicyAgent {
  policyId: string;
  parentPolicyId?: string;
  ecps: ExecutionPolicyIR;
  fitness: PolicyFitness;
  specialization: PolicySpecialization;
  active: boolean;
  /** CEL: cognitive asset ids attached to this policy portfolio (borrow / mint). */
  cognitiveArtifactRefs?: string[];
}

export const DEFAULT_POLICY_FITNESS: PolicyFitness = {
  successRate: 1,
  latency: 0,
  replayStability: 1,
  anomalyResistance: 1,
  domainCoverage: 0.5,
};

export const DEFAULT_POLICY_SPECIALIZATION: PolicySpecialization = {
  primary: 'GENERAL',
  tags: ['GENERAL'],
};
