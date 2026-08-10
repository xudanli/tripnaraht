/**
 * High-dimensional implicit parse — Shadow research scaffold.
 * @see internal-docs/product/LATENT-IMPLICIT-PARSE-SHADOW-CHARTER.md
 */

export const LATENT_SHADOW_SCHEMA = 'tripnara.latent_shadow_report@v1' as const;
export const LATENT_SHADOW_AUTHORITY = 'SHADOW_ONLY' as const;

export type LatentHypothesisKind =
  | 'CO_OCCURRENCE_CLUSTER'
  | 'RISK_PATTERN_HINT'
  | 'PREFERENCE_STRUCTURE_HINT'
  | 'UNSPECIFIED';

export interface LatentShadowHypothesis {
  hypothesisId: string;
  kind: LatentHypothesisKind;
  /** Human-readable research label — not an executable decision. */
  summary: string;
  confidence: number;
  /** Explicit fact / signal ids that motivated the heuristic. */
  supportRefs: string[];
  /** Placeholder until a real encoder exists. */
  method: 'HEURISTIC_PLACEHOLDER';
}

export interface ExplicitBaselineSnippet {
  source: 'RULE_CAUSAL' | 'DECISION_SCOPE' | 'CONSTRAINT' | 'OTHER';
  summary: string;
  snapshotId?: string;
  decisionScopeTrigger?: string;
}

export interface LatentShadowReport {
  schema: typeof LATENT_SHADOW_SCHEMA;
  authority: typeof LATENT_SHADOW_AUTHORITY;
  /** Hard invariant for consumers. */
  mustNotWritePlan: true;
  enabled: boolean;
  disabledReason?: string;
  tripId: string;
  capturedAt: string;
  hypotheses: LatentShadowHypothesis[];
  explicitBaseline?: ExplicitBaselineSnippet;
  divergence?: LatentExplicitDivergence;
}

export interface LatentExplicitDivergence {
  compared: boolean;
  /** True when latent hypotheses are not entailed by the explicit baseline summary. */
  hasNovelHint: boolean;
  notes: string[];
}
