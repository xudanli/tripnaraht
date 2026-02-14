import { RagService } from './rag.service';
import { RagRetrievalParams } from '../interfaces/rag.interface';
import { ChunkRetrievalService, ChunkRetrievalParams } from './chunk-retrieval.service';
export declare class RAGEvaluationService {
    private readonly ragService;
    private readonly chunkRetrievalService;
    private readonly logger;
    constructor(ragService: RagService, chunkRetrievalService: ChunkRetrievalService);
    evaluateRetrieval(query: string, params: RagRetrievalParams, groundTruthDocumentIds: string[]): Promise<{
        recallAtK: Record<number, number>;
        mrr: number;
        ndcg: Record<number, number>;
        retrievedIds: string[];
        scores: number[];
    }>;
    evaluateChunkRetrieval(query: string, params: ChunkRetrievalParams, groundTruthChunkIds: string[]): Promise<{
        recallAtK: Record<number, number>;
        mrr: number;
        ndcg: Record<number, number>;
        retrievedIds: string[];
        scores: number[];
    }>;
    evaluateChunkBatch(testCases: Array<{
        query: string;
        params: ChunkRetrievalParams;
        groundTruthChunkIds: string[];
    }>): Promise<{
        averageRecallAtK: Record<number, number>;
        averageMRR: number;
        averageNDCGAtK: Record<number, number>;
        perQueryResults: Array<{
            query: string;
            recallAtK: Record<number, number>;
            mrr: number;
            ndcg: Record<number, number>;
        }>;
    }>;
    evaluateBatch(testCases: Array<{
        query: string;
        params: RagRetrievalParams;
        groundTruthDocumentIds: string[];
    }>): Promise<{
        averageRecallAtK: Record<number, number>;
        averageMRR: number;
        averageNDCGAtK: Record<number, number>;
        perQueryResults: Array<{
            query: string;
            recallAtK: Record<number, number>;
            mrr: number;
            ndcg: Record<number, number>;
        }>;
    }>;
    private calculateRecallAtK;
    private calculateMRR;
    private calculateNDCGAtK;
    evaluateGateAccuracy(testSet: Array<{
        requestId: string;
        request: any;
        expectedGateResult: 'ALLOW' | 'ADJUST_REQUIRED' | 'BLOCK' | 'NEED_USER_CONFIRM';
        expectedViolations?: string[];
    }>): Promise<{
        accuracy: number;
        avgConfidence: number;
        avgEvidenceCount: number;
        alternativesCoverage: number;
        perCaseResults: Array<{
            requestId: string;
            predicted: string;
            expected: string;
            correct: boolean;
            confidence: number;
            evidenceCount: number;
            hasAlternatives: boolean;
        }>;
    }>;
    evaluateEvidenceCoverage(decisionLogs: Array<{
        requestId: string;
        evidenceRefs: Array<{
            source: string;
        }>;
    }>): Promise<{
        coverageRate: number;
        avgRagEvidence: number;
        avgToolEvidence: number;
        insufficientCases: Array<{
            requestId: string;
            ragCount: number;
            toolCount: number;
        }>;
    }>;
    evaluateAlternativesQuality(testSet: Array<{
        requestId: string;
        alternatives: Array<{
            description: string;
            type: string;
        }>;
        expectedAlternatives?: Array<{
            type: string;
        }>;
    }>): Promise<{
        provisionRate: number;
        avgAlternativesCount: number;
        typeMatchRate?: number;
    }>;
    private avg;
}
