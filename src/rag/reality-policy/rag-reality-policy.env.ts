/**
 * RAG ↔ Reality OS binding — feature flags.
 *
 * When active, soft-world retrieval must be scoped by `DecisionContextV0` + `evaluatePlanningTick`.
 */

import { isRealityEnforcementEnabled } from '../../trips/reality-kernel/reality-enforcement.env';

/** `RAG_REALITY_POLICY_ENFORCE=1|0` overrides; unset → follow REALITY_ENFORCEMENT. */
export function isRagRealityPolicyGateActive(): boolean {
  const explicit = String(process.env.RAG_REALITY_POLICY_ENFORCE ?? '').trim().toLowerCase();
  if (explicit === '0' || explicit === 'false' || explicit === 'off') {
    return false;
  }
  if (explicit === '1' || explicit === 'true' || explicit === 'on') {
    return true;
  }
  return isRealityEnforcementEnabled();
}

/** Single chunk.category filter when policy scope is `restricted` (STALE / DEGRADE). */
export function getRagDegradedChunkCategory(): string {
  return String(process.env.RAG_DEGRADED_CHUNK_CATEGORY ?? 'RULES').trim() || 'RULES';
}
