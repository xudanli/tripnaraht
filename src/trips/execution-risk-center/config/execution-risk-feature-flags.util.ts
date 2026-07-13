/** Package Sprint 3 — confirm write-back gated by feature flag (not Harness pass). */
export function isExecutionRiskConfirmWriteEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_CONFIRM_WRITE_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Legacy cutover Phase 3 — Canonical ERC is user-facing authority. */
export function isExecutionRiskCanonicalEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_CANONICAL_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Legacy cutover Phase 1–2 — dual-run Legacy authority + Canonical shadow metrics. */
export function isExecutionRiskShadowCompareEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_SHADOW_COMPARE_ENABLED;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Legacy cutover Phase 3 — fall back to legacy projection when canonical fails. */
export function isExecutionRiskLegacyFallbackEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_LEGACY_FALLBACK_ENABLED;
  if (raw === '0' || raw === 'false' || raw === 'FALSE') return false;
  return raw === '1' || raw === 'true' || raw === 'TRUE' || !isExecutionRiskCanonicalEnabled();
}

export type ExecutionRiskCutoverMode = 'LEGACY' | 'SHADOW_COMPARE' | 'CANONICAL';

/** Resolve which projection path is user-facing authority. */
export function resolveExecutionRiskCutoverMode(): ExecutionRiskCutoverMode {
  if (isExecutionRiskShadowCompareEnabled()) return 'SHADOW_COMPARE';
  if (isExecutionRiskCanonicalEnabled()) return 'CANONICAL';
  return 'LEGACY';
}

/** Sprint 3 — persist confirm writes via RFC001 PlanVersion store + ERC ledger metadata. */
export function isExecutionRiskRfc001WriteAdapterEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_RFC001_WRITE_ADAPTER;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Sprint 3 — set effective plan pointer after ERC confirm (narrow RFC001 bridge). */
export function isExecutionRiskApplyEffectivePlanEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_APPLY_EFFECTIVE_PLAN;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Sprint 3 — materialize ERC plan operations into itinerary rows (requires RFC001 materialize). */
export function isExecutionRiskItineraryMaterializeEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_ITINERARY_MATERIALIZE;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Sprint 3B — persist ActiveRisk snapshot after confirm (Phase 2/3 staging). */
export function isExecutionRiskPostConfirmRefreshEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_POST_CONFIRM_REFRESH;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

/** Sprint 3B — GET reads trip.metadata snapshot instead of recomputing risks. */
export function isExecutionRiskSnapshotQueryEnabled(): boolean {
  const raw = process.env.EXECUTION_RISK_SNAPSHOT_QUERY;
  return raw === '1' || raw === 'true' || raw === 'TRUE';
}

export function readExecutionRiskFeatureFlags() {
  return {
    EXECUTION_RISK_CANONICAL_ENABLED: isExecutionRiskCanonicalEnabled(),
    EXECUTION_RISK_SHADOW_COMPARE_ENABLED: isExecutionRiskShadowCompareEnabled(),
    EXECUTION_RISK_LEGACY_FALLBACK_ENABLED: isExecutionRiskLegacyFallbackEnabled(),
    EXECUTION_RISK_CONFIRM_WRITE_ENABLED: isExecutionRiskConfirmWriteEnabled(),
    EXECUTION_RISK_RFC001_WRITE_ADAPTER: isExecutionRiskRfc001WriteAdapterEnabled(),
    EXECUTION_RISK_APPLY_EFFECTIVE_PLAN: isExecutionRiskApplyEffectivePlanEnabled(),
    EXECUTION_RISK_ITINERARY_MATERIALIZE: isExecutionRiskItineraryMaterializeEnabled(),
    EXECUTION_RISK_POST_CONFIRM_REFRESH: isExecutionRiskPostConfirmRefreshEnabled(),
    EXECUTION_RISK_SNAPSHOT_QUERY: isExecutionRiskSnapshotQueryEnabled(),
    cutoverMode: resolveExecutionRiskCutoverMode(),
  };
}
