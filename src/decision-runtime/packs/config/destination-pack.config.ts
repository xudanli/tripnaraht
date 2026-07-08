/**
 * RFC-002 Phase 2 feature flags.
 */

export function isDestinationPackRuntimeEnabled(): boolean {
  const v = process.env.DECISION_PACK_RUNTIME;
  return v === '1' || v === 'true' || v === 'yes';
}

export function isDestinationPackRulesEnabled(): boolean {
  const v = process.env.DECISION_PACK_RULES;
  return v === '1' || v === 'true' || v === 'yes';
}
