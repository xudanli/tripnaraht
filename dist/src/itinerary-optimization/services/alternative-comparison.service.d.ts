import { OptimizationResult } from '../interfaces/plan-request.interface';
import { EvidenceChainItem } from './product-explainable-output-builder.service';
export type ComparisonDimension = 'COST' | 'RISK' | 'TIME' | 'COMFORT' | 'SAFETY';
export interface Improvement {
    dimension: ComparisonDimension;
    improvement: number;
    evidence: EvidenceChainItem[];
    explanation: string;
    impact_score: number;
}
export interface Tradeoff {
    dimension: ComparisonDimension | string;
    loss: number;
    explanation: string;
    severity: 'LOW' | 'MEDIUM' | 'HIGH';
}
export interface AlternativeComparison {
    original: {
        route: OptimizationResult;
        score: number;
    };
    alternative: {
        route: OptimizationResult;
        score: number;
    };
    improvements: Improvement[];
    tradeoffs: Tradeoff[];
    overall_score_delta: number;
    recommendation: 'ACCEPT' | 'REJECT' | 'NEED_USER_CONFIRM';
    explanation: string;
}
export declare class AlternativeComparisonService {
    private readonly logger;
    compareRoutes(original: OptimizationResult, alternative: OptimizationResult, context?: {
        weights?: {
            cost?: number;
            risk?: number;
            time?: number;
            comfort?: number;
            safety?: number;
        };
    }): Promise<AlternativeComparison>;
    compareMultipleAlternatives(original: OptimizationResult, alternatives: OptimizationResult[], context?: {
        weights?: {
            cost?: number;
            risk?: number;
            time?: number;
            comfort?: number;
            safety?: number;
        };
    }): Promise<AlternativeComparison[]>;
    private calculateOverallScore;
    private calculateCostScore;
    private calculateRiskScore;
    private calculateTimeScore;
    private calculateComfortScore;
    private calculateSafetyScore;
    private identifyImprovements;
    private identifyTradeoffs;
    private generateRecommendation;
    private generateExplanation;
    private getDimensionName;
}
