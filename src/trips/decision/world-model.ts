// src/trips/decision/world-model.ts

/**
 * Trip World Model - 旅行规划的世界模型
 * 
 * 核心思想：把旅行规划抽象成 State（世界状态）+ Constraints（约束）+ Objective（目标函数）+ Actions（动作）
 */

export type ISODate = string;     // '2026-01-02'
export type ISOTime = string;     // '08:30'
export type ISODatetime = string; // '2026-01-02T08:30:00+00:00'

export type MoneyCurrency = 'USD' | 'EUR' | 'ISK' | 'JPY' | 'CNY' | string;

export type ActivityType =
  | 'sightseeing'
  | 'nature'
  | 'museum'
  | 'food'
  | 'shopping'
  | 'transport'
  | 'hotel'
  | 'tour'
  | 'rest'
  | 'other';

export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed';

export type TravelMode = 'walk' | 'drive' | 'transit' | 'rideshare' | 'bike' | 'unknown';

export type RiskLevel = 'low' | 'medium' | 'high';

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface TimeWindow {
  start: ISOTime; // local
  end: ISOTime;   // local
}

export interface OpeningHours {
  // simplest: day-based windows. You can extend later to weekly rules.
  date: ISODate;
  windows: TimeWindow[];
  // optional flags: closedByWeather, seasonal, etc.
}

export interface CostEstimate {
  amount: number;
  currency: MoneyCurrency;
  // e.g., 'per_person', 'per_booking'
  unit?: string;
}

export interface TravelLeg {
  mode: TravelMode;
  from: GeoPoint;
  to: GeoPoint;
  durationMin: number;       // predicted
  distanceKm?: number;
  reliability?: number;      // 0~1 (optional)
  source?: string;           // 'google_routes' | 'osrm' | 'heuristic'
}

export interface ActivityCandidate {
  id: string;                 // stable ID in your DB
  name: { zh?: string; en?: string; local?: string };
  type: ActivityType;

  location?: {
    point: GeoPoint;
    address?: string;
    region?: string;
  };

  // planning metadata
  indoorOutdoor?: IndoorOutdoor;
  durationMin: number;        // typical duration
  durationMaxMin?: number;    // optional

  openingHours?: OpeningHours[];   // for dates in trip horizon
  requiresBooking?: boolean;
  bookingDifficulty?: 1 | 2 | 3 | 4 | 5; // heuristic
  inventoryRisk?: 1 | 2 | 3 | 4 | 5;     // e.g., tours sell out

  cost?: CostEstimate;
  riskLevel?: RiskLevel;      // e.g., glacier hike
  weatherSensitivity?: 0 | 1 | 2 | 3; // 0 not sensitive, 3 very sensitive

  // relevance signals
  intentTags?: string[];      // your intent taxonomy
  qualityScore?: number;      // 0~1
  uniquenessScore?: number;   // 0~1
  mustSee?: boolean;          // curated / user "must-do"

  // substitution grouping: only pick at most one in same group
  alternativeGroupId?: string; // e.g., "golden-circle-waterfall"
}

export interface UserPreferenceProfile {
  intents: Record<string, number>; // weight, e.g., { nature: 0.8, culture: 0.4 }
  pace: 'relaxed' | 'moderate' | 'intense';
  riskTolerance: RiskLevel;
  maxDailyActiveMinutes?: number; // energy budget proxy
  dislikeTags?: string[];
}

export interface TripContextState {
  destination: string;
  startDate: ISODate;
  durationDays: number;

  budget?: { amount: number; currency: MoneyCurrency; style?: 'low' | 'medium' | 'high' };

  travelModeDefault?: TravelMode;  // drive / transit
  preferences: UserPreferenceProfile;

  anchors?: {
    // "hard constraints": flights/hotels you should never move
    hotelLocationsByDate?: Record<ISODate, GeoPoint>;
    fixedEvents?: Array<{ date: ISODate; start: ISOTime; end: ISOTime; title: string }>;
  };
}

export interface ExternalSignalsState {
  // Keep it minimal first; add more later.
  weatherByDate?: Record<ISODate, any>; // your normalized weather schema
  alerts?: Array<{ code: string; severity: 'info'|'warn'|'critical'; message: string }>;
  lastUpdatedAt: ISODatetime;
}

export interface TripWorldState {
  context: TripContextState;

  // candidate pool for planning
  candidatesByDate: Record<ISODate, ActivityCandidate[]>;

  // travel time provider result cache (optional)
  travelMatrix?: Record<string, number>; // key `${fromId}->${toId}` minutes

  signals: ExternalSignalsState;

  // policies: per product requirements
  policies?: {
    dayStart?: ISOTime; // e.g. '08:00'
    dayEnd?: ISOTime;   // e.g. '21:00'
    bufferMinBetweenActivities?: number; // e.g. 10
    maxBudgetOverrunRatio?: number;      // e.g. 1.05
  };
}

