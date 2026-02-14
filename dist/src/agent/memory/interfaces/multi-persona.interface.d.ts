import { PacePreference, AltitudeTolerance, RiskTolerance, TravelPhilosophy, RouteType } from './user-travel-profile.interface';
export interface PhysicalState {
    fitnessLevel: number;
    fatigueLevel: number;
    healthStatus: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
    adaptationStatus?: 'ADAPTED' | 'ADAPTING' | 'NOT_ADAPTED';
}
export interface PsychologicalState {
    stressLevel: number;
    excitementLevel: number;
    confidenceLevel: number;
    mood: 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
}
export interface TimeState {
    availableDays: number;
    timePressure: number;
    timeFlexibility: 'HIGH' | 'MEDIUM' | 'LOW';
    timeOfDay?: 'MORNING' | 'AFTERNOON' | 'EVENING' | 'NIGHT';
    tripStage?: 'PLANNING' | 'PREPARATION' | 'TRAVELING' | 'REFLECTION';
}
export interface PreferenceState {
    pacePreference?: PacePreference;
    altitudeTolerance?: AltitudeTolerance;
    riskTolerance?: RiskTolerance;
    travelPhilosophy?: TravelPhilosophy;
    preferredRouteTypes?: RouteType[];
    interests?: string[];
    budgetPreference?: 'BUDGET' | 'MODERATE' | 'LUXURY';
    timePreference?: 'EARLY_BIRD' | 'NORMAL' | 'NIGHT_OWL';
    otherPreferences?: Record<string, any>;
}
export interface UserActivityRecord {
    timestamp: Date;
    activityType: string;
    details: Record<string, any>;
}
export interface UserPersona {
    personaName: string;
    tripType: string;
    currentState: {
        physical: PhysicalState;
        psychological: PsychologicalState;
        temporal: TimeState;
    };
    preferences: PreferenceState;
    activityHistory: UserActivityRecord[];
    createdAt: Date;
    updatedAt: Date;
    usageCount: number;
    confidence: number;
}
export interface PersonaContext {
    environment?: {
        location?: string;
        weather?: string;
        season?: string;
    };
    social?: {
        travelCompanions?: number;
        groupSize?: number;
        socialPreference?: 'SOLO' | 'SMALL_GROUP' | 'LARGE_GROUP';
    };
    situation?: {
        tripPurpose?: string;
        specialOccasion?: string;
        constraints?: string[];
    };
}
export interface PersonaChangeSignals {
    physical?: Partial<PhysicalState>;
    psychological?: Partial<PsychologicalState>;
    temporal?: Partial<TimeState>;
    preferences?: Partial<PreferenceState>;
    environment?: PersonaContext['environment'];
    social?: PersonaContext['social'];
}
export interface PersonaChangeResult {
    hasChanged: boolean;
    changeType?: 'GRADUAL' | 'ABRUPT' | 'TEMPORARY';
    changeMagnitude?: number;
    changeReasons: string[];
    newPersona?: UserPersona;
}
export interface MultiPersonaUserTravelProfile {
    userId: string;
    personas: UserPersona[];
    currentPersona?: string;
    baseProfile: {
        pacePreference?: PacePreference;
        altitudeTolerance?: AltitudeTolerance;
        riskTolerance?: RiskTolerance;
        travelPhilosophy?: TravelPhilosophy;
        preferredRouteTypes?: RouteType[];
    };
    confidence: number;
    source: 'explicit' | 'inferred' | 'mixed';
    updatedAt: Date;
}
