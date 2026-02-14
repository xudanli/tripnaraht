import { RagService } from './services/rag.service';
import { ChunkRetrievalService } from './services/chunk-retrieval.service';
import { ComplianceFactsAgent } from './services/compliance-facts-agent.service';
import { RouteKnowledgeCurator } from './services/route-knowledge-curator.service';
import { LocalInsightService } from './services/local-insight.service';
import { EnhancedChatService } from './services/enhanced-chat.service';
import { DocumentIndexItem } from './interfaces/rag.interface';
import { RAGEvaluationService } from './services/rag-evaluation.service';
import { RAGQueryCollectorService } from './services/rag-query-collector.service';
import { EmbeddingCacheService } from './services/embedding-cache.service';
import { RAGMonitoringService } from './services/rag-monitoring.service';
import { RagTestsetService, RagEvalTestset } from './services/rag-testset.service';
import { IndexingService } from '../knowledge-base/services/indexing.service';
import { RagMetricsService } from './services/rag-metrics.service';
export declare class RagController {
    private readonly ragService;
    private readonly chunkRetrieval;
    private readonly complianceFactsAgent;
    private readonly routeKnowledgeCurator;
    private readonly localInsightService;
    private readonly enhancedChat;
    private readonly ragEvaluation;
    private readonly ragQueryCollector;
    private readonly embeddingCacheService;
    private readonly ragMonitoringService;
    private readonly ragTestsetService;
    private readonly indexingService;
    private readonly ragMetricsService;
    constructor(ragService: RagService, chunkRetrieval: ChunkRetrievalService, complianceFactsAgent: ComplianceFactsAgent, routeKnowledgeCurator: RouteKnowledgeCurator, localInsightService: LocalInsightService, enhancedChat: EnhancedChatService, ragEvaluation: RAGEvaluationService, ragQueryCollector: RAGQueryCollectorService, embeddingCacheService: EmbeddingCacheService, ragMonitoringService: RAGMonitoringService, ragTestsetService: RagTestsetService, indexingService: IndexingService, ragMetricsService: RagMetricsService);
    retrieve(query: string, collection: string, countryCode?: string, limit?: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    search(body: {
        query: string;
        collection: string;
        countryCode?: string;
        tags?: string[];
        limit?: number;
        minScore?: number;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getStats(collection?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    indexDocument(item: DocumentIndexItem): Promise<void>;
    indexDocuments(body: DocumentIndexItem[] | any): Promise<void>;
    private convertRouteToDocuments;
    private extractCountryCode;
    private formatRouteOverview;
    private formatStopContent;
    private formatRiskAssessment;
    private formatSeasonalInfo;
    private formatDecisionSupport;
    extractRailPassRules(body: {
        passType: string;
        countryCode: string;
    }): Promise<import("./services/compliance-facts-agent.service").RailPassRule[]>;
    extractTrailAccessRules(body: {
        trailId: string;
        countryCode: string;
    }): Promise<import("./services/compliance-facts-agent.service").TrailAccessRule[]>;
    refreshComplianceRules(): Promise<{
        success: boolean;
        message: string;
    }>;
    getRouteNarrative(routeDirectionId: string, countryCode?: string, includeLocalInsights?: string): Promise<import("./services/route-knowledge-curator.service").RoutePhilosophyNarrative | {
        narrative: import("./services/route-knowledge-curator.service").RoutePhilosophyNarrative;
        localInsights: import("./services/local-insight.service").LocalInsight[];
    }>;
    getSegmentNarrative(body: {
        segmentId: string;
        dayIndex: number;
        name?: string;
        description?: string;
        countryCode?: string;
    }): Promise<import("./services/route-knowledge-curator.service").SegmentNarrative>;
    getLocalInsight(countryCode: string, tags: string | string[], region?: string): Promise<import("./services/local-insight.service").LocalInsight[]>;
    refreshLocalInsight(body: {
        countryCode: string;
        tags: string[];
        region?: string;
    }): Promise<import("./services/local-insight.service").LocalInsight[]>;
    answerRouteQuestion(body: {
        question: string;
        routeDirectionId?: string;
        countryCode?: string;
        segmentId?: string;
        dayIndex?: number;
        tripId?: string;
    }): Promise<import("./services/enhanced-chat.service").EnhancedAnswer>;
    explainWhyNotOtherRoute(body: {
        selectedRouteId: string;
        alternativeRouteId: string;
        countryCode: string;
    }): Promise<import("./services/enhanced-chat.service").EnhancedAnswer>;
    getDestinationInsights(placeId: string, tripId?: string, countryCode?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    extractComplianceRules(body: {
        tripId: string;
        countryCodes: string[];
        ruleTypes?: string[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getDocuments(collection?: string, countryCode?: string, tags?: string, page?: number, pageSize?: number, search?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getDocument(id: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updateDocument(id: string, item: Partial<DocumentIndexItem>): Promise<void>;
    deleteDocument(id: string): Promise<void>;
    evaluateRetrieval(body: {
        query: string;
        params: {
            query: string;
            collection: string;
            countryCode?: string;
            tags?: string[];
            limit?: number;
            minScore?: number;
        };
        groundTruthDocumentIds: string[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    evaluateBatch(body: {
        testCases: Array<{
            query: string;
            params: any;
            groundTruthDocumentIds: string[];
        }>;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    evaluateChunkRetrieval(body: {
        query: string;
        params: any;
        groundTruthChunkIds: string[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    evaluateChunkBatch(body: {
        testCases: Array<{
            query: string;
            params: any;
            groundTruthChunkIds: string[];
        }>;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getEvalTestset(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    saveEvalTestset(body: RagEvalTestset): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    runEvalTestset(body: {
        params?: any;
        limit?: number;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    findRelevantChunks(query: string, limit?: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    listAllChunks(limit?: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    collectQueryDocumentPair(body: {
        query: string;
        correctDocumentIds: string[];
        metadata?: {
            source?: string;
            userId?: string;
            sessionId?: string;
            collection?: string;
            countryCode?: string;
            tags?: string[];
        };
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    collectFromUserQuery(body: {
        query: string;
        retrievedResults: Array<{
            id: string;
            score: number;
        }>;
        userFeedback?: {
            clickedDocumentIds?: string[];
            relevantDocumentIds?: string[];
            irrelevantDocumentIds?: string[];
        };
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    collectBatch(body: {
        pairs: Array<{
            query: string;
            correctDocumentIds: string[];
            metadata?: any;
        }>;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getQueryPairs(source?: string, collection?: string, countryCode?: string, limit?: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    exportForEvaluation(body: {
        pairs: Array<{
            query: string;
            correctDocumentIds: string[];
        }>;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    retrieveChunks(body: {
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
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    rebuildKnowledgeBaseIndex(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    clearKnowledgeBaseIndex(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCacheStats(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    resetCacheStats(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    clearCache(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getMonitoringMetrics(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPerformanceMetrics(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getQualityMetrics(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getCostMetrics(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    resetMonitoringMetrics(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPrometheusMetrics(): Promise<string>;
    getMetricsStats(): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
}
