import { PrismaService } from '../../prisma/prisma.service';
import { LlmService } from '../../llm/services/llm.service';
import { ValidationCacheService } from './validation-cache.service';
import { KPUMonitoringService } from './kpu-monitoring.service';
import { SnippetValidationParams, SnippetValidationResult, OutputValidationParams, OutputValidationResult } from '../types/validation.types';
export declare class KnowledgeValidationService {
    private readonly prisma;
    private readonly llmService?;
    private readonly cacheService?;
    private readonly monitoringService?;
    private readonly logger;
    constructor(prisma: PrismaService, llmService?: LlmService, cacheService?: ValidationCacheService, monitoringService?: KPUMonitoringService);
    validateSnippet(params: SnippetValidationParams): Promise<SnippetValidationResult>;
    validateOutput(params: OutputValidationParams): Promise<OutputValidationResult>;
    private checkFactAccuracy;
    private assessSourceCredibility;
    private assessFreshness;
    private assessCompleteness;
    private checkConsistency;
    private extractCitations;
    private checkOutputFacts;
    private checkOutputConsistency;
    private checkCitationIntegrity;
    private checkOutputCompleteness;
    private extractOutputCitations;
}
