import { TrailDifficultyMetadata, ExperienceModifier } from '../interfaces/trail-difficulty.interface';
export declare class TrailDifficultyAssessor {
    static assess(metadata: any, options?: {
        season?: 'winter' | 'spring' | 'summer' | 'autumn';
        userExperience?: ExperienceModifier['experience'];
    }): TrailDifficultyMetadata | null;
    private static assessBase;
    private static checkHighRiskTriggers;
    private static fromOfficialRating;
    private static fromTechnicalGrade;
    private static fromRiskFactors;
    private static fromSubCategory;
    private static extractRiskFactors;
    private static getSeasonalModifier;
    private static getExperienceModifier;
    private static applyModifier;
    private static generateExplanations;
}
