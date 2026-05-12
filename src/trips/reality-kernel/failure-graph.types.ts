/**
 * Failure graph — minimal causal semantics (no graph DB required in v0).
 * Events must anchor to a Reality Snapshot for spatiotemporal meaning.
 */

export type FailureEventId = string;

export type FailureEdgeRelationV0 =
  | 'caused_by'
  | 'amplified_by'
  | 'recovered_by'
  | 'prevented_by';

/** Directed edge between failure events (replay / counterfactual hooks). */
export interface FailureEdgeV0 {
  from: FailureEventId;
  to: FailureEventId;
  relation: FailureEdgeRelationV0;
  /** 0–1 */
  confidence: number;
}

/** Ensures failure reasoning is tied to one canonical world slice. */
export interface FailureEventAnchorV0 {
  snapshot_id: string;
  event_id: FailureEventId;
}
