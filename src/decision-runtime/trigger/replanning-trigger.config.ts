/**
 * Replanning Trigger Policy feature flags.
 */

export function isReplanningTriggerPolicyEnabled(): boolean {
  const v = process.env.REPLANNING_TRIGGER_POLICY_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
