export interface UserContext {
    userId?: string;
    preferences?: Record<string, any>;
    profile?: Record<string, any>;
    currentState?: Record<string, any>;
}
export interface RecommendationCopy {
    headline: string;
    reasons: string[];
    considerations?: string[];
    alternatives?: string[];
    analysis?: {
        matchingPoints: string[];
        potentialChallenges: string[];
        preparationNeeds: string[];
    };
}
export type RiskType = 'WEATHER' | 'PHYSICAL' | 'SAFETY' | 'LOGISTICS' | 'FINANCIAL' | 'OTHER';
export interface TechnicalRisk {
    type: RiskType;
    level: 'LOW' | 'MEDIUM' | 'HIGH' | 'CRITICAL';
    description: string;
    details?: Record<string, any>;
}
export interface RiskCopy {
    what: string;
    why: string;
    howToPrepare: string[];
    empowerment: string;
    possibilities?: string[];
}
export type RejectionReasonType = 'SAFETY_RISK' | 'CAPABILITY_MISMATCH' | 'CONSTRAINT_VIOLATION' | 'TIMING_ISSUE' | 'BUDGET_MISMATCH' | 'OTHER';
export interface RejectionReason {
    type: RejectionReasonType;
    description: string;
    details?: Record<string, any>;
}
export interface RejectionCopy {
    headline: string;
    reason: string;
    alternatives?: string[];
    betterPlan?: string;
    explanation?: string;
}
export interface DataPresentationCopy {
    title: string;
    value: string | number;
    whatItMeans: string;
    layers?: {
        level1: string;
        level2: string;
        level3: string;
    };
    source?: string;
    confidence?: 'HIGH' | 'MEDIUM' | 'LOW';
}
