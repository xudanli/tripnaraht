/**
 * Phase 4 — PlanObject 契约（规划对象层最小切片）
 */

export type PlanObjectType =
  | 'VISIT'
  | 'ACTIVITY'
  | 'TRANSFER'
  | 'MEAL_WINDOW'
  | 'DINING'
  | 'STAY'
  | 'BUFFER'
  | 'SUPPLY_STOP';

export type PlanObjectStatus = 'PLANNED' | 'CONFIRMED' | 'TENTATIVE';

export type PlanObjectLocationMode = 'FIXED_POI' | 'ROUTE_CORRIDOR' | 'AREA';

export type PlanObjectSource =
  | 'itinerary_item'
  | 'lunch_strategy'
  | 'accommodation'
  | 'synthetic';

export interface PlanObject {
  planObjectId: string;
  type: PlanObjectType;
  dayId: string;
  dayNumber: number;
  date: string;
  sequence: number;
  startWindow?: string;
  endWindow?: string;
  durationMinutes?: number;
  locationMode?: PlanObjectLocationMode;
  locationRef?: string;
  locationLabel?: string;
  status: PlanObjectStatus;
  sourceItineraryItemId?: string;
  source: PlanObjectSource;
  metadata?: Record<string, unknown>;
}

export type PlanObjectAssessmentKind =
  | 'STAY_LINKAGE'
  | 'MEAL_WINDOW_VS_ARRIVAL'
  | 'MEAL_WINDOW_GAP'
  | 'BUFFER_LINKAGE'
  | 'DAILY_FATIGUE_LOAD'
  | 'TRANSFER_DAILY_LOAD';

export type PlanObjectAssessmentSeverity = 'INFO' | 'WARNING' | 'BLOCK';

export interface PlanObjectAssessment {
  kind: PlanObjectAssessmentKind;
  severity: PlanObjectAssessmentSeverity;
  planObjectId?: string;
  message: string;
  semanticKey: string;
  details?: Record<string, unknown>;
}

export interface PlanObjectDayProjection {
  dayId: string;
  dayNumber: number;
  date: string;
  objects: PlanObject[];
  assessments: PlanObjectAssessment[];
}

export interface PlanObjectProjectionView {
  schemaId: 'tripnara.plan_object_projection@v1';
  tripId: string;
  generatedAt: string;
  lunchStrategy: string;
  days: PlanObjectDayProjection[];
  summary: {
    totalObjects: number;
    byType: Partial<Record<PlanObjectType, number>>;
    assessmentCount: number;
  };
}
