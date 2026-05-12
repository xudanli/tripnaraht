/**
 * P-Next 7 — Converge multiple semantic replicas by **minimum divergence**, not majority vote.
 */

import type { PhysicsFieldIndex } from '../physics/unified-physics-field-index.types';
import type { ExecutionProof } from '../execution-trace-compressor/execution-proof.types';
import type { SemanticReplica } from './semantic-replica.types';

export interface SemanticConsensusOptions {
  /** Max population variance of semantic distances to call the cohort “stable”. Default 0.08 */
  stabilityVarianceThreshold?: number;
  /** Minimum {@link SemanticConsensusResult.replicaAgreementScore} for stableDecision. Default 0.5 */
  minAgreementScore?: number;
  /** Weight on mean leg uncertainty penalty (0–1 each axis). Default 0.25 */
  uncertaintyWeight?: number;
  /** Penalty when replica confidence is low. Default 0.12 */
  confidencePenaltyWeight?: number;
}

export interface SemanticConsensusResult {
  winningReplicaId: string;
  winningReplica: SemanticReplica;
  /** Winning proof with P-Next 7 cohort metrics merged (original hashes untouched). */
  consensusProof: ExecutionProof;
  semanticVariance: number;
  consensusDistance: number;
  replicaAgreementScore: number;
  stableDecision: boolean;
  /** Combined ranking scores (lower is better). */
  scoresByReplicaId: Record<string, number>;
}

function mean(xs: number[]): number {
  if (!xs.length) return 0;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function populationVariance(xs: number[]): number {
  if (xs.length <= 1) return 0;
  const m = mean(xs);
  return mean(xs.map(x => (x - m) ** 2));
}

function meanLegUncertainty(index: PhysicsFieldIndex): number {
  const legs = Object.values(index.byLegId);
  if (!legs.length) return 0;
  let s = 0;
  for (const row of legs) {
    const u = row.uncertainty;
    if (!u) continue;
    s +=
      (u.weatherVariance +
        u.routeVolatility +
        u.fuelEstimateError +
        u.temporalDrift) /
      4;
  }
  return s / legs.length;
}

function semanticDistanceOfProof(proof: ExecutionProof): number {
  return proof.semanticAggregateDistance ?? 0;
}

/**
 * Lower is better: semantic strain + uncertainty envelope + confidence slack.
 */
export function consensusScore(
  replica: SemanticReplica,
  options?: Pick<SemanticConsensusOptions, 'uncertaintyWeight' | 'confidencePenaltyWeight'>,
): number {
  const uw = options?.uncertaintyWeight ?? 0.25;
  const cw = options?.confidencePenaltyWeight ?? 0.12;
  const sem = semanticDistanceOfProof(replica.executionProof);
  const unc = meanLegUncertainty(replica.physicsField);
  const conf = Math.max(0.05, Math.min(1, replica.confidence));
  const confidenceCost = cw * (1 / conf - 1);
  return sem + uw * unc + confidenceCost;
}

/**
 * Pick the replica that minimizes combined semantic + uncertainty + confidence cost,
 * then attach cohort variance / agreement metrics to the winning proof.
 */
export function runSemanticConsensus(
  replicas: SemanticReplica[],
  options?: SemanticConsensusOptions,
): SemanticConsensusResult {
  if (!replicas.length) {
    throw new Error('SEMANTIC_CONSENSUS_EMPTY');
  }

  const stabilityThreshold = options?.stabilityVarianceThreshold ?? 0.08;
  const minAgreement = options?.minAgreementScore ?? 0.5;

  const scoresByReplicaId: Record<string, number> = {};
  for (const r of replicas) {
    scoresByReplicaId[r.replicaId] = consensusScore(r, options);
  }

  const sorted = [...replicas].sort(
    (a, b) => scoresByReplicaId[a.replicaId]! - scoresByReplicaId[b.replicaId]!,
  );
  const winner = sorted[0]!;

  const semDistances = replicas.map(r => semanticDistanceOfProof(r.executionProof));
  const semanticVariance = populationVariance(semDistances);
  const winSem = semanticDistanceOfProof(winner.executionProof);
  const consensusDistance =
    replicas.length <= 1
      ? 0
      : mean(semDistances.map(d => Math.abs(d - winSem)));

  const spread = Math.sqrt(semanticVariance);
  const replicaAgreementScore = Math.max(0, Math.min(1, 1 - Math.min(1, spread * 4)));

  const stableDecision =
    semanticVariance <= stabilityThreshold && replicaAgreementScore >= minAgreement;

  const consensusProof: ExecutionProof = {
    ...winner.executionProof,
    semanticVariance,
    consensusDistance,
    replicaAgreementScore,
    stableDecision,
  };

  return {
    winningReplicaId: winner.replicaId,
    winningReplica: winner,
    consensusProof,
    semanticVariance,
    consensusDistance,
    replicaAgreementScore,
    stableDecision,
    scoresByReplicaId,
  };
}
