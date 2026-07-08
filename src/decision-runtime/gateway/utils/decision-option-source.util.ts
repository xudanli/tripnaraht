/**
 * Capability-based option source normalization — hides legacy persona names from product contract.
 */

import type { DecisionOptionSource } from '../../../trips/decision-semantics/types/decision-semantics.types';

const SOURCE_MAP: Record<string, DecisionOptionSource> = {
  NEPTUNE: 'ALTERNATIVE_GENERATOR',
  CONSTRAINT_REPAIR: 'CONSTRAINT_SOLVER',
};

export function normalizeDecisionOptionSource(
  source: DecisionOptionSource | string | undefined,
): DecisionOptionSource {
  if (!source) return 'RULE_ENGINE';
  const mapped = SOURCE_MAP[source];
  if (mapped) return mapped;
  return source as DecisionOptionSource;
}

export function normalizeDecisionOptionSources<T extends { source: DecisionOptionSource | string }>(
  options: T[],
): T[] {
  return options.map((opt) => ({
    ...opt,
    source: normalizeDecisionOptionSource(opt.source),
  }));
}
