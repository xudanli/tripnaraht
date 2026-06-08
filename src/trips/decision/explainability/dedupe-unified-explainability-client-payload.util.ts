/**
 * 客户端 payload：explain.unified 为 SSOT；narration 内 envelope 改为引用，避免 JSON 重复。
 */

import type { OrchestratorState } from '../../../agent/interfaces/trip-plan.interface';
import type { UnifiedExplainabilityEnvelopeV1 } from './unified-explainability.types';

export const UNIFIED_EXPLAINABILITY_CLIENT_REF = 'explain.unified' as const;
export type UnifiedExplainabilityClientRef = typeof UNIFIED_EXPLAINABILITY_CLIENT_REF;

export function dedupeUnifiedExplainabilityInClientOrchestratorState(
  state: OrchestratorState | undefined,
  explainUnified: UnifiedExplainabilityEnvelopeV1 | undefined,
): OrchestratorState | undefined {
  if (!state?.narration?.unified_explainability || !explainUnified) {
    return state;
  }
  const { unified_explainability: _envelope, ...narrationRest } = state.narration;
  return {
    ...state,
    narration: {
      ...narrationRest,
      unified_explainability_ref: UNIFIED_EXPLAINABILITY_CLIENT_REF,
    },
  };
}
