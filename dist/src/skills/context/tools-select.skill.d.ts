import { ModuleRef } from '@nestjs/core';
import { Skill, SkillInput, SkillOutput } from '../interfaces/skill.interface';
import { EmbeddingService } from '../../places/services/embedding.service';
export interface ToolsSelectInput extends SkillInput {
    userQuery: string;
    planningPhase: string;
    currentState?: {
        tripId?: string;
        phase?: string;
        agent?: string;
        constraints?: string[];
    };
    toolGroupFilter?: 'DOMAIN' | 'CONTEXT' | 'ALL';
    excludeContextTools?: boolean;
}
export interface ToolsSelectOutput extends SkillOutput {
    tools: Array<{
        name: string;
        description: string;
        schema: Record<string, any>;
        suggestion: string;
        priority: number;
        reason: string;
    }>;
    totalTools: number;
}
export declare class ToolsSelectSkill implements Skill<ToolsSelectInput, ToolsSelectOutput> {
    private readonly moduleRef;
    private readonly embeddingService?;
    private readonly logger;
    metadata: {
        name: string;
        description: string;
        version: string;
        category: "rag";
        toolGroup: "CONTEXT";
    };
    private skillEmbeddingsCache;
    private cacheEnabled;
    private skillsRegistry?;
    constructor(moduleRef: ModuleRef, embeddingService?: EmbeddingService);
    private getSkillsRegistry;
    execute(input: ToolsSelectInput): Promise<ToolsSelectOutput>;
    private selectToolsByPhase;
    private selectToolsByQuery;
    private mergeAndDeduplicate;
    private selectToolsByVectorSimilarity;
    private cosineSimilarity;
    private rankAndSelect;
    private calculatePriority;
    private buildSimplifiedSchema;
    private buildSuggestion;
    private buildReason;
    private filterByToolGroup;
}
