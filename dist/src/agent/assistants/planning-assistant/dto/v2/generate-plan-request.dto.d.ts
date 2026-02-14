import { PreferencesDto } from './recommendations-request.dto';
export declare class PlanConstraintsDto {
    maxDays?: number;
    mustInclude?: string[];
    exclude?: string[];
}
export declare class PlanOptionsDto {
    count?: number;
    includeBudget?: boolean;
    includePersonas?: boolean;
    includeExplanation?: boolean;
    includeOptimizationTips?: boolean;
}
export declare class GeneratePlanRequestDto {
    sessionId?: string;
    userId?: string;
    destination?: string;
    naturalLanguageDescription?: string;
    preferences?: PreferencesDto;
    constraints?: PlanConstraintsDto;
    options?: PlanOptionsDto;
    language?: 'en' | 'zh';
}
