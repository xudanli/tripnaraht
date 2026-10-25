/**
 * PD-5.4 — CGUS / synthesis feature gates for Proactive Decision.
 */

import { isProactiveDecisionV1Enabled } from '../config/proactive-decision-feature-flags.util';

/**
 * Deterministic PD synthesis (CGUS-shaped). Requires PD V1 flag.
 */
export function isProactiveDecisionSynthesisEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isProactiveDecisionV1Enabled(env)) return false;
  const v = env.PROACTIVE_DECISION_SYNTHESIS_ENABLED?.trim().toLowerCase();
  // Default ON when PD V1 is on (safe: pure ranking, no write).
  if (v === '0' || v === 'false' || v === 'no') return false;
  return true;
}

/**
 * Optional full CGUSSearchService path — default OFF until canary.
 * Aligns with KERNEL_CGUS discipline: explicit opt-in.
 */
export function isProactiveDecisionCgusSearchEnabled(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isProactiveDecisionSynthesisEnabled(env)) return false;
  const v = env.PROACTIVE_DECISION_CGUS_SEARCH_ENABLED?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}
