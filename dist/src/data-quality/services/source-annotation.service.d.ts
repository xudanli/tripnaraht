import { SourceAnnotatedData, BatchAnnotationResult } from '../interfaces/source-annotation.interface';
export declare class SourceAnnotationService {
    private readonly logger;
    annotateAllInformation(data: any): Promise<BatchAnnotationResult>;
    annotateField(fieldName: string, value: any): Promise<SourceAnnotatedData>;
    private inferSource;
    private calculateConfidence;
    private determineVerificationLevel;
    private isFactualInformation;
    markAsLLMGenerated(data: any): any;
    isLLMGenerated(data: any): boolean;
}
