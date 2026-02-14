import { ReadinessCheckResult } from './readiness-findings.types';
export interface UserProfile {
    userId?: string;
    nationality?: string;
    residencyCountry?: string;
    tags?: string[];
    budgetLevel?: 'low' | 'medium' | 'high';
    riskTolerance?: 'low' | 'medium' | 'high';
}
export interface DeadlineEnhancement {
    itemId: string;
    deadline: string;
    evidence: string[];
    confidence: number;
}
export interface ChannelEnhancement {
    itemId: string;
    channels: Array<{
        name: string;
        url?: string;
        description?: string;
    }>;
    evidence: string[];
    confidence: number;
}
export interface RankingEnhancement {
    itemId: string;
    personalizedRank: number;
    reasoning: string;
    evidence: string[];
    confidence: number;
}
export interface ReasonEnhancement {
    itemId: string;
    reason: string;
    evidence: string[];
    confidence: number;
}
export interface AIEnhancements {
    deadlines?: DeadlineEnhancement[];
    channels?: ChannelEnhancement[];
    rankings?: RankingEnhancement[];
    reasons?: ReasonEnhancement[];
}
export interface AIEnhancedReadinessResult extends ReadinessCheckResult {
    aiEnhancements?: AIEnhancements;
    failedFeatures?: string[];
}
export interface RiskSeverityEnhancement {
    riskId: string;
    originalSeverity: 'high' | 'medium' | 'low';
    assessedSeverity: 'high' | 'medium' | 'low';
    reasoning: string;
    confidence: number;
}
export interface MitigationEnhancement {
    riskId: string;
    personalizedMitigations: string[];
    evidence: string[];
    confidence: number;
}
export interface EmergencyContactEnhancement {
    riskId: string;
    contacts: Array<{
        type: string;
        name: string;
        phone?: string;
        email?: string;
        url?: string;
    }>;
    evidence: string[];
    confidence: number;
}
export interface RiskAIEnhancements {
    severityAssessments?: RiskSeverityEnhancement[];
    mitigations?: MitigationEnhancement[];
    emergencyContacts?: EmergencyContactEnhancement[];
}
export interface PackingItemEnhancement {
    itemId: string;
    recommendedQuantity?: number;
    reason?: string;
    evidence?: string[];
    confidence?: number;
}
export interface PackingListAIEnhancements {
    itemEnhancements?: PackingItemEnhancement[];
}
export interface SolutionEnhancement {
    solutionId: string;
    title: string;
    description: string;
    cost?: {
        amount?: number;
        currency?: string;
        estimate?: string;
    };
    timeRequired?: {
        days?: number;
        estimate?: string;
    };
    feasibility: number;
    reasoning: string;
    evidence: string[];
}
export interface SolutionAIEnhancements {
    solutions?: SolutionEnhancement[];
}
