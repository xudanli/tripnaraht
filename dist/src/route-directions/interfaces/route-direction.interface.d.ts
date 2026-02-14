export interface HardConstraints {
    maxDailyRapidAscentM?: number;
    maxSlopePct?: number;
    requiresPermit?: boolean;
    requiresGuide?: boolean;
    rapidAscentForbidden?: boolean;
    [key: string]: any;
}
export interface SoftConstraints {
    maxDailyAscentM?: number;
    maxElevationM?: number;
    bufferTimeMin?: number;
    [key: string]: any;
}
export interface ObjectiveWeights {
    preferViewpoints?: number;
    preferHotSpring?: number;
    preferPhotography?: number;
    [key: string]: number;
}
export interface RouteConstraints {
    hard?: HardConstraints;
    soft?: SoftConstraints;
    objectives?: ObjectiveWeights;
    maxElevationM?: number;
    maxDailyAscentM?: number;
    maxSlope?: number;
    requiresPermit?: boolean;
    requiresGuide?: boolean;
    rapidAscentForbidden?: boolean;
    [key: string]: any;
}
export interface ComplianceRules {
    requiresPermit?: boolean;
    requiresGuide?: boolean;
    restrictedAreas?: string[];
    permitInfo?: {
        name: string;
        link?: string;
        cost?: number;
    };
    [key: string]: any;
}
export interface RiskProfile {
    altitudeSickness?: boolean;
    roadClosure?: boolean;
    ferryDependent?: boolean;
    weatherWindow?: boolean;
    weatherWindowMonths?: number[];
    [key: string]: any;
}
export interface Seasonality {
    bestMonths?: number[];
    avoidMonths?: number[];
    [key: string]: any;
}
export interface SignaturePois {
    types?: string[];
    examples?: string[];
    weights?: Record<string, number>;
    [key: string]: any;
}
export interface ItinerarySkeleton {
    dayThemes?: string[];
    dailyPace?: string;
    restDaysRequired?: number[];
    [key: string]: any;
}
export type FailureReasonType = 'fatigue' | 'weather' | 'altitude' | 'slope' | 'distance' | 'logistics' | 'technical_difficulty' | 'rock_quality' | 'rappelling_accident' | 'glacier_crossing_failure' | 'river_crossing_failure' | 'vehicle_failure' | 'weather_closure' | 'road_closure' | 'extreme_weather' | 'flash_flooding' | 'ice_conditions' | 'ice_calving' | 'avalanche' | 'altitude_sickness' | 'acute_mountain_sickness' | 'altitude_exhaustion' | 'altitude_pulmonary_edema' | 'exhaustion' | 'dehydration' | 'injury' | 'seasickness' | 'polar_bear_encounter' | 'snow_bridge_collapse' | 'peat_bog_accident' | 'cliff_accident' | 'sneaker_wave_accident' | 'sea_wave_incident' | 'equipment_failure' | 'fuel_shortage' | 'ticket_unavailable' | 'medical_emergency' | string;
export type RescueDifficultyType = 'EXTREME' | 'VERY_HIGH' | 'HIGH' | 'MEDIUM' | 'LOW';
export interface FailureProfile {
    commonFailureDays: number[];
    typicalFailureReason: FailureReasonType[];
    rescueDifficulty: RescueDifficultyType;
    failureScenarios?: Array<{
        day: number;
        reason: string;
        typicalUserProfile?: string;
        mitigation?: string;
    }>;
}
export interface RouteNarrative {
    internal: string;
    userFacing: string;
    philosophy?: string;
}
export type RoutePhilosophyField = string | import('../../trips/decision/models/route-philosophy.model').RoutePhilosophy;
export interface RouteDirectionData {
    id?: string | number;
    countryCode: string;
    name: string;
    nameCN: string;
    nameEN?: string;
    description?: string;
    tags: string[];
    regions?: string[];
    entryHubs?: string[];
    seasonality?: Seasonality;
    constraints?: RouteConstraints;
    riskProfile?: RiskProfile;
    signaturePois?: SignaturePois;
    itinerarySkeleton?: ItinerarySkeleton;
    complianceRules?: ComplianceRules;
    metadata?: Record<string, any>;
    version?: string;
    status?: 'draft' | 'active' | 'deprecated';
    extensions?: import('./route-direction-extensions.interface').RouteDirectionExtensions;
    failureProfile?: FailureProfile;
    narrative?: RouteNarrative;
    antiPersona?: string[];
    philosophy?: RoutePhilosophyField;
}
export type PoiPriority = 'MUST_SEE' | 'HIGH' | 'MEDIUM' | 'LOW' | 'OPTIONAL';
export declare const POI_PRIORITY_SCORE: Record<PoiPriority, number>;
export interface DayPlanPoi {
    id?: number;
    uuid?: string;
    nameCN: string;
    nameEN?: string;
    category?: string;
    address?: string;
    rating?: number;
    description?: string;
    required?: boolean;
    priority?: PoiPriority;
    startTime?: string;
    endTime?: string;
    durationMinutes?: number;
    priorityReason?: string;
    metadata?: Record<string, any>;
}
export interface DayPlan {
    day: number;
    theme?: string;
    maxIntensity?: string;
    maxElevationM?: number;
    requiredNodes?: string[];
    optionalActivities?: string[];
    pois?: DayPlanPoi[];
    [key: string]: any;
}
export interface RouteTemplateData {
    routeDirectionId: number;
    durationDays: number;
    name?: string;
    nameCN?: string;
    nameEN?: string;
    dayPlans: DayPlan[];
    defaultPacePreference?: 'RELAX' | 'BALANCED' | 'CHALLENGE';
    metadata?: Record<string, any>;
}
