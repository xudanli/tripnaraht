import { ChunkRetrievalService } from '../../rag/services/chunk-retrieval.service';
import { KnowledgeValidationService } from './knowledge-validation.service';
import { ValidationScoringService } from './validation-scoring.service';
import { LlmService } from '../../llm/services/llm.service';
import { KPUMonitoringService } from './kpu-monitoring.service';
import { ValidatedRetrievalResult, RetrievalAndValidateParams, GenerationWithValidationParams } from '../types/validation.types';
import { OutputValidationResult } from '../types/validation.types';
export declare class IntegratedRAGKPUService {
    private readonly chunkRetrievalService;
    private readonly validationService;
    private readonly scoringService;
    private readonly llmService?;
    private readonly monitoringService?;
    private readonly logger;
    constructor(chunkRetrievalService: ChunkRetrievalService, validationService: KnowledgeValidationService, scoringService: ValidationScoringService, llmService?: LlmService, monitoringService?: KPUMonitoringService);
    retrieveAndValidate(params: RetrievalAndValidateParams): Promise<{
        results: ValidatedRetrievalResult[];
        metadata: {
            totalCandidates: number;
            validatedCount: number;
            filteredCount: number;
            avgValidationScore: number;
            latency: number;
        };
    }>;
    generateWithValidation(params: GenerationWithValidationParams): Promise<{
        answer: string;
        validation: OutputValidationResult;
        validatedSources: ValidatedRetrievalResult[];
        retried: boolean;
        metadata: {
            generationLatency: number;
            validationLatency: number;
            totalLatency: number;
        };
    }>;
    private generateAnswer;
}
