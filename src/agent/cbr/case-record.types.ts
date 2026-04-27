export interface CaseQuerySignature {
  conflict_type: 'REACHABILITY' | 'SCOPE' | 'MIXED';
  /** Best-effort anchor from audit (e.g. REACHABILITY/terrain cid). */
  primary_violation_type?: string;
  /** Optional context keys to improve retrieval. */
  region_id?: string;
  month?: number;
  relaxation_types?: string[];
}

export interface CaseOutcomePayload {
  /** In similar cases, how often users eventually accept some relaxation. */
  historical_late_accept_rate?: number;
  /** p90 time spent before accepting (ms). */
  wall_hit_distance_p90_latency_ms?: number;
  /** p90 decision_log span before accepting. */
  wall_hit_distance_p90_event_span?: number;
  /** Key evidence that convinced users in the end. */
  evidence_anchors?: Array<{
    evidence_id?: string;
    source?: string;
    note?: string;
  }>;
}

export interface CaseRecord {
  case_id: string;
  query_signature: CaseQuerySignature;
  outcome_payload: CaseOutcomePayload;
  /** One-liner for Narrator to cite as precedent. */
  precedent_summary: string;
  /** Audit linkage for offline join / provenance. */
  provenance?: {
    early_warning_id?: string;
    request_id?: string;
    generated_at?: string;
  };
}

export interface CasePrecedent {
  case_id: string;
  summary: string;
  /** Sample size N backing this precedent (authoritative thresholding). */
  sample_count?: number;
  /** Late accept count in N samples (optional). */
  late_accept_count?: number;
  stats?: {
    historical_late_accept_rate?: number;
    wall_hit_distance_p90_latency_ms?: number;
    wall_hit_distance_p90_event_span?: number;
  };
  evidence_anchors?: CaseOutcomePayload['evidence_anchors'];
}

