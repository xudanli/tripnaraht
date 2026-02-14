export type DecisionPriority = 'WEATHER' | 'TERRAIN' | 'ROAD_ACCESS' | 'VEHICLE' | 'USER_PERSONA' | 'HUMAN_PHYSIOLOGY';
export interface AgentDuties {
    mustWarn: boolean;
    mustReject: boolean;
    mustProvideFallback: boolean;
    mustExplicitRisk?: boolean;
}
export type RouteStratification = 'SAFE_BASELINE' | 'ICONIC_BUT_SENSITIVE' | 'HIGH_RISK_INTERIOR';
export type UnacceptablePlanFeature = 'NO_WEATHER_BUFFER' | 'NO_DEM_EVIDENCE' | 'NO_ALTERNATIVE_CORRIDOR' | 'NO_ACCLIMATIZATION' | 'RAPID_ASCENT_FORBIDDEN' | 'NO_GUIDE_REQUIRED';
export interface ExtremeCountryProfile {
    countryCode: string;
    countryName: string;
    coreNature: string[];
    decisionPriority: DecisionPriority[];
    agentDuties: AgentDuties;
    routeStratification: RouteStratification[];
    unacceptablePlans: UnacceptablePlanFeature[];
    nonNegotiableFacts: string[];
    humanPhysiologyRequired?: {
        altitudeAdaptationRequired: boolean;
        hypoxiaRiskCurve: boolean;
        acclimatizationDays: number;
    };
}
export interface ExtremeCountryTemplate {
    name: string;
    description: string;
    baseProfile: Omit<ExtremeCountryProfile, 'countryCode' | 'countryName'>;
    adaptationRules?: {
        countryCodePattern?: string[];
        adaptProfile?: (countryCode: string) => Partial<ExtremeCountryProfile>;
    };
}
export declare const ICELAND_EXTREME_PROFILE: ExtremeCountryProfile;
export declare const EXTREME_COUNTRY_TEMPLATE: ExtremeCountryTemplate;
