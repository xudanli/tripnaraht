export type FeasibilityLevel = '完全可行' | '有条件可行' | '困难' | '不可行';
export type TimelinessLevel = '最佳时机' | '合适时机' | '可接受' | '不建议' | '警告';
export type MatchingLevel = '高度匹配' | '基本匹配' | '部分匹配' | '不匹配';
export type RouteExistenceStatus = 'EXISTS' | 'CONDITIONAL_EXISTS' | 'NOT_EXISTS';
export interface Accessibility {
    available: boolean;
    explanation: string;
    limitations?: string[];
}
export interface TimeFeasibility {
    feasible: boolean;
    tight: boolean;
    explanation: string;
}
export interface TransportAvailability {
    available: boolean;
    methods: string[];
    explanation: string;
}
export interface AdmissionRequirements {
    requiresPermit: boolean;
    permitObtained: boolean;
    otherRequirements?: string[];
}
export interface FeasibilityJudgment {
    level: FeasibilityLevel;
    accessibility: Accessibility;
    timeFeasibility: TimeFeasibility;
    transportAvailability: TransportAvailability;
    admissionRequirements: AdmissionRequirements;
}
export interface SeasonFit {
    best: boolean;
    good: boolean;
    ok: boolean;
    bad: boolean;
    explanation: string;
}
export interface WeatherFit {
    good: boolean;
    ok: boolean;
    hasWarning: boolean;
    explanation: string;
}
export interface CrowdFit {
    normal: boolean;
    veryHigh: boolean;
    explanation: string;
}
export interface EventImpact {
    hasImpact: boolean;
    impactType?: 'POSITIVE' | 'NEGATIVE' | 'NEUTRAL';
    explanation: string;
}
export interface TimelinessJudgment {
    level: TimelinessLevel;
    seasonFit: SeasonFit;
    weatherFit: WeatherFit;
    crowdFit: CrowdFit;
    eventImpact: EventImpact;
}
export interface MatchScore {
    score: number;
    explanation: string;
}
export interface MatchingJudgment {
    overallMatch: MatchingLevel;
    physicalMatch: MatchScore;
    experienceMatch: MatchScore;
    timeMatch: MatchScore;
    budgetMatch: MatchScore;
    preferenceMatch: MatchScore;
}
export interface RouteExistenceJudgment {
    feasibility: FeasibilityJudgment;
    timeliness: TimelinessJudgment;
    matching: MatchingJudgment;
    existence: {
        status: RouteExistenceStatus;
        reason: string;
        evidence: string[];
        score: number;
    };
    explanation: string;
}
export interface RouteContext {
    currentDate: Date;
    travelDates?: {
        start: Date;
        end: Date;
    };
    weather?: any;
    crowd?: any;
    transport?: any;
    events?: any[];
}
export interface UserProfile {
    fitnessLevel?: number;
    experienceLevel?: number;
    availableDays?: number;
    budget?: number;
    preferences?: Record<string, any>;
    riskTolerance?: 'LOW' | 'MEDIUM' | 'HIGH';
}
