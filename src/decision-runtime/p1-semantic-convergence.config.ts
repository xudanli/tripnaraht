/**
 * P1 — Semantic convergence master switch (interfaces & defaults only; no directory moves).
 *
 * When enabled (default in production):
 * - Constraint Gateway defaults to ON (no SHADOW dual-run unless explicitly set)
 * - Decision Runtime defaults to CANONICAL
 * - Guide Accept prefers Canonical L2 (legacy remains P0 LEGACY_CLOSED)
 * - Budget stops dual-writing legacy totalBudget/total fields
 * - Legacy V1.5 engine stays FALLBACK but marked deprecated for new semantic work
 *
 * Escape: P1_SEMANTIC_CONVERGENCE=0
 */

export function isP1SemanticConvergenceEnabled(): boolean {
  const raw = process.env.P1_SEMANTIC_CONVERGENCE?.trim().toLowerCase();
  if (raw === '0' || raw === 'false' || raw === 'no' || raw === 'off') return false;
  if (raw === '1' || raw === 'true' || raw === 'yes' || raw === 'on') return true;
  return process.env.NODE_ENV === 'production';
}

/** Prefer single Constraint Gateway authority (no dual-run default). */
export function p1PrefersConstraintGatewayOn(): boolean {
  return isP1SemanticConvergenceEnabled();
}

/** Prefer Canonical Decision Runtime over Legacy V1.5 for new work. */
export function p1PrefersCanonicalDecisionRuntime(): boolean {
  return isP1SemanticConvergenceEnabled();
}

/** Guide accept must use Canonical path when convergence on. */
export function p1RequiresGuideCanonicalAccept(): boolean {
  return isP1SemanticConvergenceEnabled();
}

/**
 * Budget legacy field mirror (totalBudget / total).
 * Default OFF under P1; set BUDGET_DUAL_WRITE_LEGACY=1 to keep dual-write.
 */
export function isBudgetLegacyDualWriteEnabled(): boolean {
  const raw = process.env.BUDGET_DUAL_WRITE_LEGACY?.trim().toLowerCase();
  if (raw === '1' || raw === 'true' || raw === 'yes') return true;
  if (raw === '0' || raw === 'false' || raw === 'no') return false;
  return !isP1SemanticConvergenceEnabled();
}

/** Legacy V1.5 may still serve FALLBACK reads; do not route new semantic keys to it. */
export function isLegacyDecisionEngineDeprecatedForNewWork(): boolean {
  return isP1SemanticConvergenceEnabled();
}
