export type TripLifecycleStatus =
  | 'IDEA_CAPTURED'
  | 'INTENT_UNDERSTOOD'
  | 'STRATEGY_DRAFTED'
  | 'ITINERARY_DRAFTED'
  | 'VERIFIED'
  | 'BOOKING_READY'
  | 'IN_PROGRESS'
  | 'COMPLETED';

export type PlanningReadiness =
  | 'INSUFFICIENT'
  | 'PARTIAL'
  | 'READY_FOR_STRATEGY'
  | 'READY_FOR_ITINERARY';

export type FeasibilityStatus =
  | 'NOT_CHECKED'
  | 'CHECKING'
  | 'PASS'
  | 'PASS_WITH_WARNING'
  | 'REPAIR_REQUIRED'
  | 'BLOCKED'
  | 'UNKNOWN';

export type DraftTripInput = {
  userId: string;
  title?: string;
  destinationCountryCode?: string;
  destinationText?: string;
  durationDays?: number;
  rawUserIntent: string;
  partialParams: Record<string, unknown>;
};

export type LightweightTripIntent = {
  destinationCountryCode?: string;
  destinationText?: string;
  dateText?: string;
  datePrecision: 'NONE' | 'MONTH' | 'DATE_RANGE';
  durationDays?: number;
  companions: string[];
  mustHaveExperiences: string[];
  constraints: string[];
  pace?: 'RELAXED' | 'MODERATE' | 'INTENSIVE';
};

export type ClarificationStage =
  | 'TRIP_CREATION'
  | 'STRATEGY_GENERATION'
  | 'ITINERARY_GENERATION'
  | 'CANDIDATE_VERIFICATION'
  | 'BOOKING'
  | 'EXECUTION';

export type ClarificationFieldPolicy = {
  field: string;
  requiredAt: ClarificationStage;
  blockingLevel: 'NON_BLOCKING' | 'BLOCK_CURRENT_STEP' | 'BLOCK_EXECUTION';
  fallbackPolicy: 'USE_CONSERVATIVE_DEFAULT' | 'USE_INFERENCE' | 'ASK_USER' | 'MARK_UNKNOWN';
  informationGain: number;
  question: string;
};
