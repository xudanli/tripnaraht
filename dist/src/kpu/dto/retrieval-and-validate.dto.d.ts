export declare class ValidationOptionsDto {
    enableFactCheck?: boolean;
    enableConsistencyCheck?: boolean;
    enableCitationCheck?: boolean;
}
export declare class RetrievalAndValidateRequestDto {
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
    validationOptions?: ValidationOptionsDto;
    context?: Record<string, any>;
}
export declare class ValidationMetadataDto {
    totalCandidates: number;
    validatedCount: number;
    filteredCount: number;
    avgValidationScore: number;
    latency: number;
}
export declare class ValidationResultDto {
    factCheck: 'pass' | 'fail' | 'unknown';
    sourceCredibility: number;
    freshness: number;
    completeness: number;
    consistency: 'consistent' | 'inconsistent' | 'unknown';
    overallScore: number;
}
export declare class CitationDto {
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
export declare class ValidatedRetrievalResultDto {
    id: string;
    chunkId: string;
    content: string;
    type: string;
    credibilityScore: number;
    similarity: number;
    hybridScore?: number;
    validation: ValidationResultDto;
    citations: CitationDto[];
}
export declare class RetrievalAndValidateResponseDto {
    results: ValidatedRetrievalResultDto[];
    metadata: ValidationMetadataDto;
}
