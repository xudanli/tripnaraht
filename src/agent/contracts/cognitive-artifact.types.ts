/**
 * Cognitive Economy Layer (CEL) — execution knowledge as tradable, amortizable cognitive assets.
 *
 * Policies compete at MAPE; CEL models reuse, pricing, and transfer of distilled artifacts above raw IR.
 */

import type { ReplayProvenance } from './replay-provenance.types';

export type CognitiveArtifactType =
  | 'routing_pattern'
  | 'tool_sequence'
  | 'replay_strategy'
  | 'confidence_model'
  | 'failure_pattern';

/**
 * Atomic reusable unit extracted from traces / compiler output — priced by utility, depreciated by misuse.
 */
export interface CognitiveArtifact {
  artifactId: string;
  type: CognitiveArtifactType;
  value: unknown;
  provenance: ReplayProvenance;
  /** Market price proxy — rises with success/reuse; decays with anomalies / staleness. */
  utilityScore: number;
  /** Policy agent that first registered this asset (optional). */
  sourcePolicyId?: string;
  /** Borrow edges — policies that imported this asset into their portfolio. */
  borrowedByPolicyIds?: string[];
  usageCount?: number;
  createdAt: number;
  updatedAt: number;
}

/** Ledger row for cross-policy transfers (audit / replay). */
export interface CognitiveAssetTransfer {
  transferId: string;
  artifactId: string;
  fromPolicyId?: string;
  toPolicyId: string;
  transferredAt: number;
  /** Optional utility adjustment applied at transfer time. */
  utilityDelta?: number;
}
