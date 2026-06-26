/** P5 feature flags — counterfactual closure. */

export function isCausalCounterfactualOnOpsOutcomeEnabled(): boolean {
  const raw =
    process.env.CAUSAL_COUNTERFACTUAL_ON_OPS_OUTCOME ??
    process.env.TRIP_CAUSAL_COUNTERFACTUAL_OPS ??
    '1';
  return !['0', 'false', 'no', 'off'].includes(String(raw).toLowerCase());
}
