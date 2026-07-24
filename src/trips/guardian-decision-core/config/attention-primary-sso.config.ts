/**
 * Slice 4 Phase C — Visible Primary SSO cutover (allowlist only).
 * @see internal-docs/frontend/EXECUTION-USER-NARRATIVE-CONTRACT.md §6 Phase C
 */

import { DEFAULT_ATTENTION_INTERNAL_DUAL_READ_TRIP_IDS } from './attention-internal-dual-read.config';

export const ATTENTION_PRIMARY_SSO_CUTOVER_SCHEMA_ID = 'tripnara.attention_primary_sso_cutover@v1';

function readEnabledEnv(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[key]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function parseAttentionPrimarySsoTripAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = env.ATTENTION_PRIMARY_SSO_TRIP_ALLOWLIST?.trim();
  const ids = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_ATTENTION_INTERNAL_DUAL_READ_TRIP_IDS];
  return new Set(ids);
}

export function isTripEligibleForAttentionPrimarySsoCutover(
  tripId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!readEnabledEnv('ATTENTION_ROOT_CAUSE_PRIMARY_SSO', env)) return false;
  if (!readEnabledEnv('ATTENTION_ROOT_CAUSE_ORCHESTRATION', env)) return false;
  return parseAttentionPrimarySsoTripAllowlist(env).has(tripId);
}
