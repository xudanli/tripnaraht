/**
 * PD-1 — Proactive Decision V1 feature flags.
 * Default OFF — enable only after PD-0/2 contracts are wired in canary.
 */

export function isProactiveDecisionV1Enabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const v = env.PROACTIVE_DECISION_V1_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
