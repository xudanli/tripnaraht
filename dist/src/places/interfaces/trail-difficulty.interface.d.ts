export interface TrailDifficultyMetadata {
    level: 'EASY' | 'MODERATE' | 'HARD' | 'EXTREME';
    technicalGrade?: number;
    riskFactors?: RiskFactor[];
    requiresEquipment?: boolean;
    requiresGuide?: boolean;
    source?: 'alltrails' | 'komoot' | 'official' | 'community' | 'manual';
    confidence?: number;
    explanations?: string[];
    seasonalModifier?: SeasonalModifier;
}
export type RiskFactor = 'scramble' | 'rope' | 'exposure' | 'technical' | 'cliff' | 'ice' | 'loose_rock' | 'unstable' | 'winter_ice' | 'rain_loose' | 'snow' | 'melt_water';
export interface SeasonalModifier {
    season: 'winter' | 'spring' | 'summer' | 'autumn';
    modifier: number;
    reason: string;
}
export declare const DIFFICULTY_LEVEL: {
    readonly EASY: "EASY";
    readonly MODERATE: "MODERATE";
    readonly HARD: "HARD";
    readonly EXTREME: "EXTREME";
};
export type DifficultyLevel = typeof DIFFICULTY_LEVEL[keyof typeof DIFFICULTY_LEVEL];
export declare const DIFFICULTY_SEMANTICS: Record<DifficultyLevel, {
    stars: string;
    meaning: string;
    riskLevel: 'low' | 'medium' | 'high' | 'very_high' | 'extreme';
}>;
export declare const DIFFICULTY_FATIGUE_MODIFIER: Record<DifficultyLevel, number>;
export interface ExperienceModifier {
    experience: 'beginner' | 'intermediate' | 'advanced' | 'expert';
    modifier: number;
    reason: string;
}
export declare const EXPERIENCE_MODIFIER: Record<ExperienceModifier['experience'], number>;
