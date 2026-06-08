/** Memory OS P0 — Constraint Sink schema (see docs/MEMORY_OS_P0_PRD.md) */

export const CONSTRAINT_SINK_V1_KEY = 'constraint_sink_v1';

export type ConstraintSinkProvenance = 'rule' | 'llm' | 'hybrid';

export interface ConstraintDeltaV1 {
  destination_pivot?: { from?: string; to: string };
  negative?: {
    avoid_poi_types?: string[];
    avoid_regions?: string[];
    notes_zh?: string;
  };
  budget?: { total?: number; currency?: string };
  pace?: 'relaxed' | 'normal' | 'tight';
  party?: {
    adults?: number;
    children?: number;
    fitness_level?: 'low' | 'medium' | 'high';
  };
}

export interface ConstraintSinkPatchV1 {
  id: string;
  at: string;
  message_id?: string;
  session_id?: string;
  confidence: number;
  delta: ConstraintDeltaV1;
  provenance: ConstraintSinkProvenance;
}

export interface ConstraintSinkStateV1 {
  revision: 'v1';
  patches: ConstraintSinkPatchV1[];
}

export type ConstraintSinkScheduleParams = {
  sessionId: string;
  tripId: string;
  userId: string;
  messageId: string;
  message: string;
  recentHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
  locale?: 'zh' | 'en';
};

export type ConstraintSinkResult = {
  applied: boolean;
  patch_ids: string[];
  skipped_reason?: 'no_trip_id' | 'low_confidence' | 'feature_off' | 'extract_failed' | 'anonymous_user';
  confidence?: number;
};

export type ConstraintSinkHydrateResult = {
  tripPlanRequest: import('../../interfaces/trip-plan.interface').TripPlanRequest;
  applied: {
    keys: string[];
    patch_ids: string[];
    overridden_by_request: string[];
  };
};
