/**
 * Memory Write Policy — 不是每句话都记。
 * P0 Explicit / P1 Strong Inference / P2 Weak Signal
 */

import type { MemorySourceType, MemoryEventStatus } from '../types/memory-event.types';
import type { MemoryCandidateDraft } from '../episode/outcome-attribution.util';

export type WritePolicyTier = 'P0_EXPLICIT' | 'P1_STRONG_INFERENCE' | 'P2_WEAK_SIGNAL';

export type WritePolicyDecision =
  | {
      allow: true;
      tier: WritePolicyTier;
      confidence: number;
      status: MemoryEventStatus;
      op: 'ADD' | 'CONFIRM';
    }
  | {
      allow: false;
      tier: WritePolicyTier;
      reason: string;
      keepEpisodeOnly?: boolean;
    };

export function classifyWriteTier(sourceType: MemorySourceType): WritePolicyTier {
  if (sourceType === 'USER_EXPLICIT') return 'P0_EXPLICIT';
  if (
    sourceType === 'STRONG_INFERENCE' ||
    sourceType === 'DECISION_OUTCOME' ||
    sourceType === 'SYSTEM_ATTRIBUTION'
  ) {
    return 'P1_STRONG_INFERENCE';
  }
  return 'P2_WEAK_SIGNAL';
}

export function evaluateWritePolicy(input: {
  sourceType: MemorySourceType;
  confidence?: number;
  explicitConfirm?: boolean;
}): WritePolicyDecision {
  const tier = classifyWriteTier(input.sourceType);

  if (tier === 'P0_EXPLICIT' || input.explicitConfirm) {
    return {
      allow: true,
      tier: 'P0_EXPLICIT',
      confidence: 1,
      status: 'ACTIVE',
      op: input.explicitConfirm ? 'CONFIRM' : 'ADD',
    };
  }

  if (tier === 'P1_STRONG_INFERENCE') {
    const confidence = input.confidence ?? 0.55;
    if (confidence < 0.4) {
      return {
        allow: false,
        tier,
        reason: 'inference_confidence_too_low',
        keepEpisodeOnly: true,
      };
    }
    // Decision Outcome 只允许写 CANDIDATE，禁止直接 ACTIVE/Profile
    const status: MemoryEventStatus =
      input.sourceType === 'DECISION_OUTCOME' ||
      input.sourceType === 'SYSTEM_ATTRIBUTION'
        ? 'CANDIDATE'
        : 'INFERRED';
    return {
      allow: true,
      tier,
      confidence,
      status,
      op: 'ADD',
    };
  }

  return {
    allow: false,
    tier: 'P2_WEAK_SIGNAL',
    reason: 'weak_signal_episode_only',
    keepEpisodeOnly: true,
  };
}

export function evaluateCandidateWrite(
  candidate: MemoryCandidateDraft,
): WritePolicyDecision {
  return evaluateWritePolicy({
    sourceType: candidate.sourceType,
    confidence: candidate.confidence,
  });
}
