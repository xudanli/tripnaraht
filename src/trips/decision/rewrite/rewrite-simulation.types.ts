/**
 * Hypothetical topology rewrite branch — 与 builder / canonical snapshot 隔离。
 */

import type { RewriteOperation } from './rewrite-operation.types';

export type RewriteSimulationVerdict = 'IMPROVED' | 'NEUTRAL' | 'REGRESSED';

export type RewriteKind =
  | 'OVERNIGHT_RELOCATION'
  | 'CORRIDOR_MIGRATION'
  | 'TIMELINE_SHIFT'
  | 'OTHER';

export interface RewriteSimulationProjectedSignals {
  daylightRecoveryMinutes?: number;
  fatigueDelta?: number;
  opportunityGain?: number;
}

export interface RewriteSimulationConstraintDelta {
  resolvedViolations: string[];
  introducedViolations: string[];
}

export interface RewriteSimulation {
  rewriteId: string;
  /** 来源 Overnight proposal / migration proposal 的稳定 id */
  sourceProposalId?: string;
  kind: RewriteKind;
  affectedDays: string[];
  operations: RewriteOperation[];
  projectedSignals: RewriteSimulationProjectedSignals;
  projectedConstraintChanges: RewriteSimulationConstraintDelta;
  /** 与 projectedSignals 对齐的展示层估计（可选重复字段便于 UI） */
  estimatedEffects?: {
    daylightRecoveryMinutes?: number;
    fatigueReduction?: number;
    auroraOpportunityGain?: number;
    bookingDisruptionCost?: number;
  };
  verdict: RewriteSimulationVerdict;
  confidence: number;
  /** 与 semantic lineage / fingerprint 对齐的说明 */
  lineageNote?: string;
}
