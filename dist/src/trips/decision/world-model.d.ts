export type ISODate = string;
export type ISOTime = string;
export type ISODatetime = string;
export type MoneyCurrency = 'USD' | 'EUR' | 'ISK' | 'JPY' | 'CNY' | string;
export type ActivityType = 'sightseeing' | 'nature' | 'museum' | 'food' | 'shopping' | 'transport' | 'hotel' | 'tour' | 'rest' | 'other';
export type IndoorOutdoor = 'indoor' | 'outdoor' | 'mixed';
export type TravelMode = 'walk' | 'drive' | 'transit' | 'rideshare' | 'bike' | 'unknown';
export type RiskLevel = 'low' | 'medium' | 'high';
export interface GeoPoint {
    lat: number;
    lng: number;
}
export interface TimeWindow {
    start: ISOTime;
    end: ISOTime;
}
export interface OpeningHours {
    date: ISODate;
    windows: TimeWindow[];
}
export interface CostEstimate {
    amount: number;
    currency: MoneyCurrency;
    unit?: string;
}
export interface TravelLeg {
    mode: TravelMode;
    from: GeoPoint;
    to: GeoPoint;
    durationMin: number;
    distanceKm?: number;
    reliability?: number;
    source?: string;
}
export interface ActivityCandidate {
    id: string;
    name: {
        zh?: string;
        en?: string;
        local?: string;
    };
    type: ActivityType;
    location?: {
        point: GeoPoint;
        address?: string;
        region?: string;
    };
    indoorOutdoor?: IndoorOutdoor;
    durationMin: number;
    durationMaxMin?: number;
    openingHours?: OpeningHours[];
    requiresBooking?: boolean;
    bookingDifficulty?: 1 | 2 | 3 | 4 | 5;
    inventoryRisk?: 1 | 2 | 3 | 4 | 5;
    cost?: CostEstimate;
    riskLevel?: RiskLevel;
    weatherSensitivity?: 0 | 1 | 2 | 3;
    intentTags?: string[];
    qualityScore?: number;
    uniquenessScore?: number;
    mustSee?: boolean;
    alternativeGroupId?: string;
}
export interface UserPreferenceProfile {
    intents: Record<string, number>;
    pace: 'relaxed' | 'moderate' | 'intense';
    riskTolerance: RiskLevel;
    maxDailyActiveMinutes?: number;
    dislikeTags?: string[];
}
export interface TripContextState {
    destination: string;
    startDate: ISODate;
    durationDays: number;
    budget?: {
        amount: number;
        currency: MoneyCurrency;
        style?: 'low' | 'medium' | 'high';
    };
    travelModeDefault?: TravelMode;
    preferences: UserPreferenceProfile;
    anchors?: {
        hotelLocationsByDate?: Record<ISODate, GeoPoint>;
        fixedEvents?: Array<{
            date: ISODate;
            start: ISOTime;
            end: ISOTime;
            title: string;
        }>;
    };
}
export interface ExternalSignalsState {
    weatherByDate?: Record<ISODate, any>;
    alerts?: Array<{
        code: string;
        severity: 'info' | 'warn' | 'critical';
        message: string;
    }>;
    lastUpdatedAt: ISODatetime;
}
export interface TripWorldState {
    context: TripContextState;
    candidatesByDate: Record<ISODate, ActivityCandidate[]>;
    travelMatrix?: Record<string, number>;
    signals: ExternalSignalsState;
    policies?: {
        dayStart?: ISOTime;
        dayEnd?: ISOTime;
        bufferMinBetweenActivities?: number;
        maxBudgetOverrunRatio?: number;
    };
}
