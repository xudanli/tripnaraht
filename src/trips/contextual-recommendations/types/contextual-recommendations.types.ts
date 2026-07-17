/**
 * Contextual same-day micro-planning contracts (ADR-009).
 */

export type ContextualRecommendationScenario = 'SAME_DAY_ACTIVITY';

export type TeamEnergyLevel = 'LOW' | 'MEDIUM' | 'HIGH';

export type DesiredIntensity = 'LIGHT' | 'MODERATE' | 'FULL';

export type TripPhaseHint =
  | 'ARRIVAL_DAY'
  | 'IN_TRIP'
  | 'DEPARTURE_DAY'
  | 'UNKNOWN';

export type AlternativeCharacter =
  | 'MOST_RELAXED'
  | 'MORE_EXPERIENCE'
  | 'BALANCED';

export type MicroPlanGate = 'ALLOW' | 'NEED_CONFIRM' | 'REJECT';

export type MicroPlanSlotType =
  | 'HOTEL_CHECK_IN'
  | 'DINING'
  | 'LIGHT_ACTIVITY'
  | 'REST'
  | 'TRANSFER'
  | 'OTHER';

export interface GeoPointDto {
  lat: number;
  lng: number;
  label?: string;
}

export interface ContextualTeamStateDelta {
  energy?: TeamEnergyLevel;
  temporaryConstraints?: string[];
}

export interface ContextualRecommendationsContextDelta {
  currentLocation?: GeoPointDto | string;
  currentTime?: string;
  availableUntil?: string;
  desiredReturnTime?: string;
  tripPhase?: TripPhaseHint;
  desiredIntensity?: DesiredIntensity;
  teamState?: ContextualTeamStateDelta;
  preference?: string[];
}

export type HotelAnchorSource = 'FOCUS_DAY' | 'PRIOR_OVERNIGHT';

export interface CanonicalHotelFact {
  name: string;
  cityName?: string | null;
  lat?: number | null;
  lng?: number | null;
  confirmed: boolean;
  placeId?: number | null;
  /** Where tonight's hotel was resolved from */
  anchorSource?: HotelAnchorSource | null;
  /** Calendar day (1-based) that owned the accommodation item */
  anchorDayIndex?: number | null;
}

export interface CanonicalTomorrowFact {
  dayIndex: number;
  firstActivityStart?: string | null;
  theme?: string | null;
  earlyDeparture: boolean;
}

export interface CanonicalTeamFact {
  memberCount: number;
  childrenPresent: boolean;
  elderlyPresent: boolean;
  physicalConstraints: string[];
}

export interface CanonicalSameDayContext {
  tripId: string;
  destination: string;
  countryCode: string;
  focusDayIndex: number;
  tripPhase: TripPhaseHint;
  hotel: CanonicalHotelFact | null;
  tomorrow: CanonicalTomorrowFact | null;
  team: CanonicalTeamFact;
  weatherHint?: string | null;
  sources: {
    fromDelta: string[];
    fromBackend: string[];
  };
}

export interface MergedSameDayProblem {
  canonical: CanonicalSameDayContext;
  intent?: string | null;
  currentTimeIso: string;
  availableUntil?: string | null;
  desiredReturnTime?: string | null;
  currentLocation?: GeoPointDto | null;
  energy: TeamEnergyLevel;
  desiredIntensity: DesiredIntensity;
  temporaryConstraints: string[];
  preferences: string[];
  /** Drive ETA enrichment (airport/current → hotel) */
  travelEta?: SameDayTravelEta | null;
  /** Nearby dining / light activity from Place catalog */
  localCandidates?: SameDayLocalCandidate[];
}

export type SameDayTravelEta = {
  driveMinutes: number;
  pickupBufferMinutes: number;
  totalMinutesUntilHotel: number;
  method: string;
  fromLabel?: string | null;
};

export type SameDayLocalCandidate = {
  placeId: number;
  name: string;
  kind: 'DINING' | 'LIGHT_ACTIVITY';
  productId?: string;
  distanceKm?: number;
};

export interface MicroPlanScheduleSlot {
  type: MicroPlanSlotType;
  startTime: string;
  endTime: string;
  title?: string;
  productId?: string;
  placeId?: number;
  note?: string;
}

export interface MicroPlanImpact {
  additionalDrivingMinutes: number;
  walkingMinutes: number;
  estimatedCost?: number | null;
  currency?: string;
  tomorrowPlanImpact: 'NONE' | 'LOW' | 'MEDIUM' | 'HIGH';
}

export interface MicroPlanRecommendation {
  title: string;
  reasonCodes: string[];
  score: number;
  schedule: MicroPlanScheduleSlot[];
  impact: MicroPlanImpact;
  gate: MicroPlanGate;
  feasibility?: {
    repaired: boolean;
    violations: Array<{ code: string; severity: 'HARD' | 'SOFT'; message: string }>;
  };
}

export interface MicroPlanAlternative {
  title: string;
  character: AlternativeCharacter;
  reasonCodes?: string[];
  /** Present when combination solver filled a full schedule for this option */
  score?: number;
  schedule?: MicroPlanScheduleSlot[];
  gate?: MicroPlanGate;
  impact?: MicroPlanImpact;
}

export interface ContextualRecommendationsObservation {
  summary: string;
  facts?: string[];
}

export interface ContextualRecommendationsView {
  scenario: ContextualRecommendationScenario;
  observation: ContextualRecommendationsObservation;
  recommendation: MicroPlanRecommendation;
  alternatives: MicroPlanAlternative[];
  context: {
    tripPhase: TripPhaseHint;
    focusDayIndex: number;
    hotelCity?: string | null;
    energy: TeamEnergyLevel;
    sources: CanonicalSameDayContext['sources'];
    intentCompileSource?: 'rules' | 'rules+llm' | 'none';
    intentMatchedPhrases?: string[];
    /** Lightweight combination solver metadata */
    solverMethod?: 'enumeration_v1' | string;
    candidatesEvaluated?: number;
  };
}
