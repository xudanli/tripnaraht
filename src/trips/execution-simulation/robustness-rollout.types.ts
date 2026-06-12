/**
 * Robustness Rollout — unified API contract (physical + organizational dimensions).
 */

import type { ExecutionIR } from '../execution-ir/execution-ir.types';
import type { RobustnessPartyContext } from '../multiverse/travel-latent-state.types';

export type RobustnessPerturbationKind = 'WEATHER' | 'TRANSPORT' | 'FATIGUE' | 'SOCIAL';

export interface RobustnessSimulationConfig {
  /** Monte-Carlo-style sample count (deterministic seeds per index) */
  sampleCount: number;
  enabledPerturbations: RobustnessPerturbationKind[];
  /** Social stress threshold for organizational failure [0, 1] */
  organizationalStressThreshold?: number;
}

export interface EnhancedSimulationPlan {
  baseIR: ExecutionIR;
  party: RobustnessPartyContext;
  simulationConfig: RobustnessSimulationConfig;
}

export type BottleneckPrimaryRisk =
  | 'PHYSICAL_BLOCK'
  | 'EMOTIONAL_EXPLOSION'
  | 'TIME_CRUNCH';

export interface RolloutTimelineNode {
  timestamp: string;
  nodeId: string;
  baseUtility: number;
  /** Fraction of samples where node passed physical checks [0, 1] */
  physicsRobustness: number;
  /** Mean social stress index at this node [0, 1] */
  socialStressIndex: number;
  activePerturbations: string[];
}

export interface RobustnessBottleneck {
  nodeId: string;
  primaryRisk: BottleneckPrimaryRisk;
  triggerEvent: string;
  description: string;
}

export interface ContingencyPlan {
  triggerNodeId: string;
  condition: string;
  /** Mutated IR stub — B-axis reroute / rest insertion */
  mutatedIR: ExecutionIR;
}

export interface RobustnessRolloutResult {
  /** P(on-time core node completion) across N perturbations */
  physicalRobustnessScore: number;
  /** P(no severe team fracture / regret) across N perturbations */
  organizationalRobustnessScore: number;
  bottlenecks: RobustnessBottleneck[];
  timeline: RolloutTimelineNode[];
  contingencyPlans: ContingencyPlan[];
  /** Raw per-sample audit (optional downstream) */
  sampleSummaries: RobustnessSampleSummary[];
}

export interface RobustnessSampleSummary {
  variantId: string;
  physicalPass: boolean;
  organizationalPass: boolean;
  peakSocialStress: number;
  pathCost: number;
  failureCount: number;
  perturbationTags: string[];
}

/** Per-node context extracted from witness DAG for rollout stress evaluation */
export interface RolloutNodeContext {
  nodeId: string;
  date: string;
  durationMinutes: number;
  elevationGainM: number;
  weatherSeverity: number;
}
