/**
 * Slice 4 — Internal Dual-Read gate (not Primary SSO).
 * @see internal-docs/operations/SLICE-4-ATTENTION-ROOT-CAUSE-ORCHESTRATION.md §11.1
 */

import { ATTENTION_SHADOW_CANARY_TRIP_ID } from '../attention/attention-shadow-staging-replay-catalog';
import { DEFAULT_WEATHER_CANARY_TRIP_ID } from '../../../decision-runtime/monitoring/assertion-promotion/assertion-promotion.config';

export const ATTENTION_INTERNAL_DUAL_READ_SCHEMA_ID = 'tripnara.attention_internal_dual_read@v1';

/** Default canary trips: Execution Slip + Weather. */
export const DEFAULT_ATTENTION_INTERNAL_DUAL_READ_TRIP_IDS = [
  ATTENTION_SHADOW_CANARY_TRIP_ID,
  DEFAULT_WEATHER_CANARY_TRIP_ID,
] as const;

function readEnabledEnv(key: string, env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env[key]?.trim().toLowerCase();
  return v === '1' || v === 'true' || v === 'yes';
}

export function isAttentionInternalDualReadEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return readEnabledEnv('ATTENTION_INTERNAL_DUAL_READ_ENABLED', env);
}

export function parseAttentionInternalDualReadTripAllowlist(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = env.ATTENTION_INTERNAL_DUAL_READ_TRIP_ALLOWLIST?.trim();
  const ids = raw
    ? raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean)
    : [...DEFAULT_ATTENTION_INTERNAL_DUAL_READ_TRIP_IDS];
  return new Set(ids);
}

export function parseAttentionInternalDualReadUserIds(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = env.ATTENTION_INTERNAL_DUAL_READ_USER_IDS?.trim();
  if (!raw) return new Set();
  return new Set(raw.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean));
}

export function parseAttentionInternalDualReadEmailDomains(
  env: NodeJS.ProcessEnv = process.env,
): Set<string> {
  const raw = env.ATTENTION_INTERNAL_DUAL_READ_EMAIL_DOMAINS?.trim() || 'tripnara.dev';
  return new Set(
    raw
      .split(/[,;\s]+/)
      .map((s) => s.trim().toLowerCase().replace(/^@/, ''))
      .filter(Boolean),
  );
}

export function isTripEligibleForAttentionInternalDualRead(
  tripId: string,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!isAttentionInternalDualReadEnabled(env)) return false;
  return parseAttentionInternalDualReadTripAllowlist(env).has(tripId);
}

export function isUserEligibleForAttentionInternalDualRead(
  user: { userId?: string; email?: string; roles?: string[] } | undefined,
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  if (!user?.userId) return false;

  const roles = user.roles ?? [];
  if (roles.includes('ADMIN') || roles.includes('OPERATOR')) return true;

  const allowUsers = parseAttentionInternalDualReadUserIds(env);
  if (allowUsers.size > 0 && allowUsers.has(user.userId)) return true;

  const email = user.email?.trim().toLowerCase();
  if (email) {
    const domains = parseAttentionInternalDualReadEmailDomains(env);
    const domain = email.split('@')[1];
    if (domain && domains.has(domain)) return true;
  }

  return allowUsers.size === 0 && parseAttentionInternalDualReadEmailDomains(env).size === 0;
}
