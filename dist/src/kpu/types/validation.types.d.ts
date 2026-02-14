import { ChunkRetrievalResult } from '../../rag/services/chunk-retrieval.service';
export interface ValidatedRetrievalResult extends ChunkRetrievalResult {
    validation: {
        factCheck: 'pass' | 'fail' | 'unknown';
        sourceCredibility: number;
        freshness: number;
        completeness: number;
        consistency: 'consistent' | 'inconsistent' | 'unknown';
        overallScore: number;
    };
    citations: Citation[];
}
export interface Citation {
    id: string;
    content: string;
    source: string;
    documentId?: string;
    confidence: number;
    position?: {
        field: string;
        paragraph?: number;
        line?: number;
    };
}
export interface SnippetValidationParams {
    content: string;
    source?: string;
    metadata?: Record<string, any>;
    context?: Record<string, any>;
    options?: {
        enableFactCheck: boolean;
        enableConsistencyCheck: boolean;
        enableCitationCheck: boolean;
    };
}
export interface SnippetValidationResult {
    factCheck: 'pass' | 'fail' | 'unknown';
    sourceCredibility: number;
    freshness: number;
    completeness: number;
    consistency: 'consistent' | 'inconsistent' | 'unknown';
    citations?: Citation[];
    details?: string;
}
export interface OutputValidationParams {
    output: string;
    sources: ValidatedRetrievalResult[];
    query: string;
    context?: Record<string, any>;
    options?: {
        enableFactCheck: boolean;
        enableConsistencyCheck: boolean;
        enableCitationCheck: boolean;
        enableCompletenessCheck: boolean;
    };
}
export interface OutputValidationResult {
    overall: 'pass' | 'fail' | 'warning';
    score: number;
    factChecks: Array<{
        id: string;
        description: string;
        passed: boolean;
        details: string;
        sources: string[];
    }>;
    consistencyChecks: Array<{
        id: string;
        type: 'internal' | 'external' | 'contextual';
        passed: boolean;
        details: string;
    }>;
    citations: Citation[];
    warnings: string[];
}
export interface RetrievalAndValidateParams {
    query: string;
    limit?: number;
    credibilityMin?: number;
    type?: string;
    category?: string;
    chunkCategory?: string;
    fileId?: string;
    useHybridSearch?: boolean;
    denseWeight?: number;
    sparseWeight?: number;
    useReranking?: boolean;
    rerankTopK?: number;
    useQueryExpansion?: boolean;
    maxQueryVariants?: number;
    useIntentClassification?: boolean;
    minValidationScore?: number;
    enableSnippetValidation?: boolean;
    validationOptions?: {
        enableFactCheck: boolean;
        enableConsistencyCheck: boolean;
        enableCitationCheck: boolean;
    };
    context?: Record<string, any>;
}
export interface GenerationWithValidationParams {
    query: string;
    validatedResults: ValidatedRetrievalResult[];
    context?: Record<string, any>;
    retryOnFailure?: boolean;
    maxRetries?: number;
}
export interface ScoringFactors {
    factCheck: 'pass' | 'fail' | 'unknown';
    credibility: number;
    freshness: number;
    completeness: number;
    consistency: 'consistent' | 'inconsistent' | 'unknown';
    similarity: number;
}
