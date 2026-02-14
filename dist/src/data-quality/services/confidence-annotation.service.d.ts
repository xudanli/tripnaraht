import { ConfidenceLevel, ConfidenceLevelDefinition, EnhancedConfidenceAnnotation, ConfidenceAnnotatedData, BatchConfidenceAnnotationResult, ConfidenceAnnotationConfig } from '../interfaces/confidence-annotation.interface';
import { SourceAnnotatedData } from '../interfaces/source-annotation.interface';
import { SourceAnnotationService } from './source-annotation.service';
export declare class ConfidenceAnnotationService {
    private readonly sourceAnnotationService;
    private readonly logger;
    private readonly confidenceLevelDefinitions;
    constructor(sourceAnnotationService: SourceAnnotationService);
    annotateAllWithConfidence(data: any, config?: ConfidenceAnnotationConfig): Promise<BatchConfidenceAnnotationResult>;
    enhanceWithConfidence(fieldName: string, sourceAnnotated: SourceAnnotatedData, config: ConfidenceAnnotationConfig): Promise<ConfidenceAnnotatedData>;
    private detectUncertainty;
    private scoreToConfidenceLevel;
    private findLowestConfidenceLevel;
    private generateConfidenceReason;
    private generateUserFriendlyDescription;
    private shouldDisplayToUser;
    private generateDisplaySuggestion;
    getConfidenceLevelDefinition(level: ConfidenceLevel): ConfidenceLevelDefinition;
    getAllConfidenceLevelDefinitions(): Record<ConfidenceLevel, ConfidenceLevelDefinition>;
    formatConfidenceAnnotation(confidence: EnhancedConfidenceAnnotation): string;
}
