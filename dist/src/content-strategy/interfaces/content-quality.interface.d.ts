export type ContentType = 'RECOMMENDATION' | 'WARNING' | 'REJECTION' | 'EXPLANATION' | 'INFORMATION' | 'QUESTION' | 'CONFIRMATION';
export type CheckStatus = 'PASS' | 'WARNING' | 'FAIL';
export interface RationalityCheckResult {
    status: CheckStatus;
    score: number;
    checks: {
        hasDataSources: {
            passed: boolean;
            message: string;
            dataSources?: string[];
        };
        hasRecommendationReasons: {
            passed: boolean;
            message: string;
            reasons?: string[];
        };
        considersMultipleAngles: {
            passed: boolean;
            message: string;
            angles?: string[];
        };
        noContradictions: {
            passed: boolean;
            message: string;
            contradictions?: string[];
        };
    };
    overallMessage: string;
    suggestions: string[];
}
export interface WarmthCheckResult {
    status: CheckStatus;
    score: number;
    checks: {
        hasUnderstanding: {
            passed: boolean;
            message: string;
            evidence?: string[];
        };
        noCommanding: {
            passed: boolean;
            message: string;
            commandingPhrases?: string[];
        };
        respectsAutonomy: {
            passed: boolean;
            message: string;
            autonomyRespects?: string[];
        };
        hasHumanDetails: {
            passed: boolean;
            message: string;
            humanDetails?: string[];
        };
    };
    overallMessage: string;
    suggestions: string[];
}
export interface ExecutabilityCheckResult {
    status: CheckStatus;
    score: number;
    checks: {
        isDirectlyUsable: {
            passed: boolean;
            message: string;
            issues?: string[];
        };
        noAbstractExpressions: {
            passed: boolean;
            message: string;
            abstractExpressions?: string[];
        };
        userCanUnderstand: {
            passed: boolean;
            message: string;
            unclearParts?: string[];
        };
        systemCanExecute: {
            passed: boolean;
            message: string;
            executionIssues?: string[];
        };
    };
    overallMessage: string;
    suggestions: string[];
}
export interface EthicsCheckResult {
    status: CheckStatus;
    score: number;
    checks: {
        noSalesHiddenInfo: {
            passed: boolean;
            message: string;
            hiddenInfo?: string[];
        };
        noOverRiskRendering: {
            passed: boolean;
            message: string;
            overRiskPhrases?: string[];
        };
        safetyFirst: {
            passed: boolean;
            message: string;
            safetyConcerns?: string[];
        };
        userDecisionPower: {
            passed: boolean;
            message: string;
            decisionPowerIssues?: string[];
        };
    };
    overallMessage: string;
    suggestions: string[];
}
export interface ContentQualityCheckResult {
    contentType: ContentType;
    content: string;
    rationality: RationalityCheckResult;
    warmth: WarmthCheckResult;
    executability: ExecutabilityCheckResult;
    ethics: EthicsCheckResult;
    overallScore: number;
    overallStatus: CheckStatus;
    passed: boolean;
    criticalIssues: string[];
    recommendations: string[];
}
export interface ContentQualityCheckConfig {
    strictMode?: boolean;
    minRationalityScore?: number;
    minWarmthScore?: number;
    minExecutabilityScore?: number;
    minEthicsScore?: number;
    requireAllChecks?: boolean;
}
export interface ContentContext {
    contentType: ContentType;
    content: string;
    metadata?: {
        dataSources?: string[];
        recommendationReasons?: string[];
        userProfile?: {
            persona?: string;
            experienceLevel?: 'beginner' | 'intermediate' | 'advanced';
            riskTolerance?: 'low' | 'medium' | 'high';
        };
        relatedContent?: string[];
        decisionContext?: {
            hasAlternatives?: boolean;
            isCriticalDecision?: boolean;
            requiresUserConfirmation?: boolean;
        };
    };
}
