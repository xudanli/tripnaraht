import { ValidatedRetrievalResultDto } from './retrieval-and-validate.dto';
export declare class GenerateAndValidateRequestDto {
    query: string;
    validatedResults: ValidatedRetrievalResultDto[];
    context?: Record<string, any>;
    retryOnFailure?: boolean;
    maxRetries?: number;
}
export declare class FactCheckDto {
    id: string;
    description: string;
    passed: boolean;
    details: string;
    sources: string[];
}
export declare class ConsistencyCheckDto {
    id: string;
    type: 'internal' | 'external' | 'contextual';
    passed: boolean;
    details: string;
}
export declare class OutputValidationResultDto {
    overall: 'pass' | 'fail' | 'warning';
    score: number;
    factChecks: FactCheckDto[];
    consistencyChecks: ConsistencyCheckDto[];
    citations: any[];
    warnings: string[];
}
export declare class GenerationMetadataDto {
    generationLatency: number;
    validationLatency: number;
    totalLatency: number;
}
export declare class GenerateAndValidateResponseDto {
    answer: string;
    validation: OutputValidationResultDto;
    validatedSources: ValidatedRetrievalResultDto[];
    retried: boolean;
    metadata: GenerationMetadataDto;
}
