/**
 * Suggestive healing (Phase B) — options returned alongside INTERRUPT-class violations.
 * Distinct from silent budget heal: requires explicit user acceptance before COMMIT.
 */

export type HealingOptionKind = 'TEMPORAL_SHIFT' | 'ROUTE_REOPTIMIZE';

export type HealingSuggestionRisk = 'LOW' | 'MEDIUM' | 'HIGH';

/** One actionable suggestion (UI may render as primary CTA). */
export interface HealingOption {
  kind: HealingOptionKind;
  /** Stable handle for analytics / replay (e.g. temporal_shift_iceland_fr_v1). */
  option_id: string;
  violation_codes_addressed: string[];
  summary: string;
  /** Plan 1 whole-itinerary shift: client applies the same calendar delta to all POI / leg timestamps. */
  temporal_shift?: {
    anchor_enter_at: string;
    suggested_enter_at: string;
    shift_days: number;
    buffer_days: number;
    policy_id?: string;
    policy_source_key?: string;
    risk: HealingSuggestionRisk;
    rationale: string;
  };
}
