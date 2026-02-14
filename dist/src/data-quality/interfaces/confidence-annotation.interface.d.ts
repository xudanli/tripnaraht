import { ExtendedDataSourceInfo, VerificationLevel } from './source-annotation.interface';
export type ConfidenceLevel = 'A' | 'B' | 'C' | 'D';
export interface ConfidenceLevelDefinition {
    level: ConfidenceLevel;
    name: string;
    confidenceRange: {
        min: number;
        max: number;
    };
    description: string;
    usageGuidance: string;
}
export type UncertaintyType = 'MISSING_DATA' | 'OUTDATED_DATA' | 'ESTIMATED_VALUE' | 'LLM_GENERATED' | 'LOW_CONFIDENCE' | 'CONFLICTING_SOURCES' | 'PARTIAL_VERIFICATION';
export interface UncertaintyAnnotation {
    type: UncertaintyType;
    degree: number;
    reason: string;
    impact: string[];
    mitigation?: string[];
}
export interface EnhancedConfidenceAnnotation {
    confidenceLevel: ConfidenceLevel;
    confidenceScore: number;
    source: ExtendedDataSourceInfo;
    verificationLevel: VerificationLevel;
    uncertainty?: UncertaintyAnnotation;
    confidenceReason: string;
    userFriendlyDescription: string;
}
export interface ConfidenceAnnotatedData<T = any> {
    value: T;
    fieldName: string;
    confidence: EnhancedConfidenceAnnotation;
    shouldDisplay: boolean;
    displaySuggestion?: {
        showConfidence: boolean;
        showSource: boolean;
        showUncertainty: boolean;
        warningMessage?: string;
    };
}
export interface BatchConfidenceAnnotationResult {
    annotatedData: Record<string, ConfidenceAnnotatedData>;
    statistics: {
        totalFields: number;
        annotatedFields: number;
        levelA: number;
        levelB: number;
        levelC: number;
        levelD: number;
        uncertainFields: number;
        llmGeneratedFields: number;
    };
    overallConfidence: {
        averageScore: number;
        averageLevel: ConfidenceLevel;
        lowestLevel: ConfidenceLevel;
    };
    annotatedAt: Date;
}
export interface ConfidenceAnnotationConfig {
    showLowConfidence: boolean;
    showLLMGenerated: boolean;
    minConfidenceThreshold: number;
    requireSourceVerification: boolean;
}
