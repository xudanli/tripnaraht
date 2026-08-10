/**
 * Epistemic boundary — MODEL_INFERENCE facts are non-authoritative for hard BLOCK.
 */

import type { TravelWorldFact } from './travel-world-fact.types';

export interface DerivedAssertion {
  assertionId: string;
  code: string;
  message: string;
  factRefs: string[];
  ruleRef: string;
  severity: 'INFO' | 'WARNING' | 'NEED_CONFIRM' | 'BLOCK';
  computedAt: string;
}

export interface ModelHypothesis {
  hypothesisId: string;
  summary: string;
  confidence: number;
  modelRef?: string;
  relatedFactIds?: string[];
  producedAt: string;
}

export const NON_AUTHORITATIVE_FACT_KINDS = ['SYSTEM_INFERRED', 'EFFECTIVE_DECISION'] as const;
export type NonAuthoritativeFactKind = (typeof NON_AUTHORITATIVE_FACT_KINDS)[number];

export function isModelInferenceAuthority(
  fact: Pick<TravelWorldFact, 'authorityLevel'>,
): boolean {
  return fact.authorityLevel === 'MODEL_INFERENCE';
}

export function hardBlockHasAuthoritativeFactRef(
  factRefs: string[],
  facts: TravelWorldFact[],
): boolean {
  if (factRefs.length === 0) return false;
  const byId = new Map(facts.map((f) => [f.factId, f]));
  return factRefs.some((id) => {
    const f = byId.get(id);
    return f != null && f.authorityLevel !== 'MODEL_INFERENCE';
  });
}
