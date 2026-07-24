/**
 * ONT-P2 — InterventionDeadline contract
 */

export const INTERVENTION_DEADLINE_SCHEMA_ID =
  'tripnara.intervention_deadline@v1' as const;

export interface InterventionDeadline {
  schemaId: typeof INTERVENTION_DEADLINE_SCHEMA_ID;
  deadlineId: string;
  temporalImpactId: string;
  tripId?: string;

  /** Latest recommended action-by instant (ISO) */
  interventionDeadline: string;
  /** Human/machine rationale codes */
  derivation: {
    method: 'LEAD_TIME_BEFORE_ONSET' | 'LEAD_TIME_BEFORE_DETERIORATION' | 'EXPLICIT';
    leadTimeMinutes: number;
    anchorAt: string;
    notes?: string[];
  };

  recommendedActions: Array<
    'SHIFT_DEPARTURE' | 'AVOID_EXPOSED_SEGMENT' | 'DOWNGRADE_VEHICLE' | 'MONITOR_ONLY'
  >;

  authorityMode: 'SHADOW';
  computedAt: string;
}
