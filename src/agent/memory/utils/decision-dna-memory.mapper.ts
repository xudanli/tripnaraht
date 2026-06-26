import type { DecisionDnaDto } from '../../services/user-profile-learning.service';
import type { DecisionDnaEvolutionReason } from '../governance/decision-dna-compliance.types';
import { REASON_TO_SIGNAL_SOURCE, SIGNAL_TIER_REGISTRY } from '../governance/decision-dna-compliance.types';
import type { DecisionDnaToMemoryPatch, MemoryFieldValue } from '../schemas/memory-state.schema.v1';

export function mapDecisionDnaToMemoryPatch(params: {
  userId: string;
  dna: DecisionDnaDto;
  reason: DecisionDnaEvolutionReason;
  now?: Date;
}): DecisionDnaToMemoryPatch {
  const now = params.now ?? new Date();
  const iso = now.toISOString();
  const signalSource = REASON_TO_SIGNAL_SOURCE[params.reason];
  const tier = SIGNAL_TIER_REGISTRY[signalSource];

  const longTermPatch: Record<string, MemoryFieldValue<unknown>> = {};

  if (params.dna.dominant_alternative) {
    longTermPatch['decision.bias.dominant_alternative'] = {
      value: params.dna.dominant_alternative,
      confidence: params.dna.confidence_score,
      provenance: { source: signalSource, signalTier: tier, capturedAt: iso },
      updatedAt: iso,
      halfLifeDays: 365,
    };
  }

  if (params.dna.traits?.cost_sensitivity) {
    longTermPatch['preference.cost_sensitivity'] = {
      value: params.dna.traits.cost_sensitivity,
      confidence: params.dna.confidence_score,
      provenance: { source: signalSource, signalTier: tier, capturedAt: iso },
      updatedAt: iso,
      halfLifeDays: 180,
    };
  }

  return {
    decisionDnaRef: {
      confidence: params.dna.confidence_score,
      lastSyncedAt: params.dna.last_synced_at,
      dominantAlternative: params.dna.dominant_alternative,
    },
    longTermPatch: Object.keys(longTermPatch).length ? longTermPatch : undefined,
    updatedAt: iso,
  };
}
