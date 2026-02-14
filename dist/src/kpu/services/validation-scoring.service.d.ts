import { ScoringFactors } from '../types/validation.types';
export declare class ValidationScoringService {
    calculateOverallScore(factors: ScoringFactors): number;
    calculateQualityScore(factors: ScoringFactors): number;
    calculateCredibilityScore(factors: ScoringFactors): number;
}
