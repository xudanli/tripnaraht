/**
 * Decision Trigger Gateway feature flags.
 * Default off — normalize/route only when enabled; legacy entry points unchanged.
 */

export function isDecisionTriggerGatewayEnabled(): boolean {
  const v = process.env.DECISION_TRIGGER_GATEWAY_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

/** When enabled, append trigger lineage for every normalized run (observability). */
export function isDecisionTriggerLineageEnabled(): boolean {
  if (!isDecisionTriggerGatewayEnabled()) return false;
  const v = process.env.DECISION_TRIGGER_LINEAGE_ENABLED?.trim().toLowerCase();
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}
