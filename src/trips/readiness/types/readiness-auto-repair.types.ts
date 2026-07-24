// src/trips/readiness/types/readiness-auto-repair.types.ts

import type { ReadinessScoreBreakdown } from './coverage-map.types';

export type AutoRepairActionStatus = 'applied' | 'skipped' | 'failed' | 'queued';

export interface AutoRepairRequest {
  tripId: string;
  blockerIds?: string[];
  maxActions?: number;
}

export interface ApplyRepairRequest {
  tripId: string;
  blockerId: string;
  optionId: string;
}

export interface RefreshEvidenceRequest {
  tripId: string;
}

export interface AutoRepairActionResult {
  blockerId: string;
  optionId?: string;
  actionType?: string;
  status: AutoRepairActionStatus;
  message?: string;
}

export interface RefreshEvidenceResult {
  tripId: string;
  placesUpdated: number;
  weatherApplied: number;
  roadApplied: number;
  evidenceSuggestions?: {
    hasMissingEvidence: boolean;
    completenessScore: number;
    suggestionsCount: number;
    taskId?: string;
  };
}

export interface AutoRepairResponse {
  tripId: string;
  attempted: number;
  applied: number;
  skipped: number;
  failed: number;
  repairs: AutoRepairActionResult[];
  refresh?: RefreshEvidenceResult;
  scoreBefore?: ReadinessScoreBreakdown;
  scoreAfter?: ReadinessScoreBreakdown;
}

export interface ApplyRepairResponse {
  tripId: string;
  blockerId: string;
  optionId: string;
  actionType?: string;
  status: AutoRepairActionStatus;
  message?: string;
  scoreAfter?: ReadinessScoreBreakdown;
}
