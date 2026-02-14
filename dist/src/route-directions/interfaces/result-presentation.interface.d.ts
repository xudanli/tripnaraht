import { RouteDirectionData } from './route-direction.interface';
import { RouteExistenceJudgment } from './route-judgment.interface';
import { ComprehensiveRiskAssessment } from './enhanced-risk-assessment.interface';
import { RhythmMatchResult } from '../../trips/decision/interfaces/rhythm-matching.interface';
import { ThreeLayerExplanation } from '../../trips/decision/interfaces/three-layer-explanation.interface';
export interface IntegratedJudgmentResult {
    existenceJudgment: RouteExistenceJudgment;
    riskAssessment: ComprehensiveRiskAssessment;
    rhythmMatching: RhythmMatchResult;
    overallRecommendation: {
        conclusion: 'RECOMMEND' | 'CONDITIONAL_RECOMMEND' | 'NOT_RECOMMEND';
        score: number;
        summary: string;
    };
    explanation: ThreeLayerExplanation;
    alternatives: AlternativeRouteOption[];
    formattedOutput: FormattedResultOutput;
}
export interface AlternativeRouteOption {
    routeId: string;
    routeName: string;
    route: RouteDirectionData;
    reason: string;
    differences: {
        advantages: string[];
        disadvantages: string[];
    };
    suitableFor: string[];
    matchScore: number;
}
export interface FormattedResultOutput {
    title: string;
    existenceSection: {
        title: string;
        status: string;
        details: string[];
        formatted: string;
    };
    riskSection: {
        title: string;
        summary: string;
        details: Array<{
            category: string;
            level: string;
            emoji: string;
            description: string;
        }>;
        formatted: string;
    };
    rhythmSection: {
        title: string;
        recommendedRhythm: string;
        reason: string;
        adjustments: string[];
        formatted: string;
    };
    recommendationSection: {
        title: string;
        conclusion: string;
        score: number;
        summary: string;
        formatted: string;
    };
    alternativesSection: {
        title: string;
        alternatives: Array<{
            name: string;
            reason: string;
            matchScore: number;
        }>;
        formatted: string;
    };
    fullFormatted: string;
}
