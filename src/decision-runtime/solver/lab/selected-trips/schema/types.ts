/** Frozen selected-trip pack contracts (M4-RA-01A). */

export const APPROVED_PILOT_OPERATIONS = [
  'SHIFT',
  'SWAP',
  'SHORTEN',
  'REROUTE',
] as const;

export type PilotOperation = (typeof APPROVED_PILOT_OPERATIONS)[number];

export const PII_FORBIDDEN_KEYS = [
  'email',
  'phone',
  'phoneNumber',
  'fullName',
  'firstName',
  'lastName',
  'passport',
  'creditCard',
  'paymentMethod',
  'cardNumber',
  'nationalId',
] as const;

export interface SelectedTripManifest {
  schemaId: 'tripnara.selected_trip.manifest@v1';
  tripId: string;
  planVersionId: string;
  evidenceVersionId: string;
  environment: 'local' | 'ci' | 'staging' | 'staging-test' | 'production';
  destination: string;
  intendedOperation: PilotOperation | string;
  timezone: string;
  source: 'gold_replay' | 'staging_export' | 'production_export' | 'synthetic';
  deidentified: boolean;
  eligibility: 'pending' | 'eligible' | 'blocked';
  blockedReasons?: string[];
}

export interface TripContextFile {
  schemaId: 'tripnara.selected_trip.context@v1';
  tripId: string;
  planVersionId: string;
  timezone: string;
  dateRange: { startDate: string; endDate: string };
  destination: string;
  deidentified: boolean;
  memberCount?: number;
  notes?: string[];
}

export interface EffectivePlanActivity {
  activityId: string;
  poiId?: string;
  dayId: string;
  isBooked: boolean;
  canRemove?: boolean;
  timeWindow?: { startMin: number; endMin: number };
  lat?: number;
  lng?: number;
  serviceDurationMin?: number;
}

export interface EffectivePlanFile {
  schemaId: 'tripnara.selected_trip.effective_plan@v1';
  tripId: string;
  planVersionId: string;
  days: Array<{
    dayId: string;
    date?: string;
    activities: EffectivePlanActivity[];
  }>;
}

export interface EvidenceSnapshotFile {
  schemaId: 'tripnara.selected_trip.evidence@v1';
  tripId: string;
  evidenceVersionId: string;
  frozenAt: string;
  sources: Array<{ provider: string; ref: string }>;
  event?: Record<string, unknown>;
}

export interface ConstraintsFile {
  schemaId: 'tripnara.selected_trip.constraints@v1';
  tripId: string;
  planVersionId: string;
  constraints: Array<{
    canonicalId: string;
    kind: string;
    hard: boolean;
  }>;
}

export interface TravelMatrixFile {
  schemaId: 'tripnara.selected_trip.travel_matrix@v1';
  tripId: string;
  unit: 'minutes';
  edges: Array<{ from: string; to: string; durationMin: number }>;
}

export interface TriggerFile {
  schemaId: 'tripnara.selected_trip.trigger@v1';
  tripId: string;
  planVersionId: string;
  evidenceVersionId: string;
  operation: string;
  kind: string;
  notes?: string[];
}

export interface ExpectedOutcomeFile {
  schemaId: 'tripnara.selected_trip.expected_outcome@v1';
  tripId: string;
  expectation: 'accept' | 'reject' | 'fallback';
  maxChangedActivities?: number;
  mustPreserveBooked: boolean;
  gateway?: 'PASS' | 'BLOCK';
  notes?: string[];
  reviewedBy?: string;
  reviewedAt?: string;
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warn';
  path: string;
  message: string;
}

export interface ValidationReport {
  tripId: string;
  ok: boolean;
  eligible: boolean;
  issues: ValidationIssue[];
  intendedOperation?: string;
  /** From manifest.source — synthetic/gold do not count toward Dataset READY. */
  source?: SelectedTripManifest['source'];
  expectation?: ExpectedOutcomeFile['expectation'];
}
