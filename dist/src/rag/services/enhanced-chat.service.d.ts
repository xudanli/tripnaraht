import { RagService } from './rag.service';
import { RouteKnowledgeCurator } from './route-knowledge-curator.service';
import { LocalInsightService } from './local-insight.service';
import { PrismaService } from '../../prisma/prisma.service';
import { IntegratedRAGKPUService } from '../../kpu/services/integrated-rag-kpu.service';
export interface RouteQuestionContext {
    routeDirectionId?: string;
    countryCode?: string;
    segmentId?: string;
    dayIndex?: number;
    tripId?: string;
}
export interface EnhancedAnswer {
    answer: string;
    source: 'STRUCTURED' | 'RAG' | 'HYBRID';
    structuredData?: any;
    ragSnippets?: Array<{
        content: string;
        source?: string;
        score: number;
    }>;
    localInsights?: Array<{
        content: string;
        tags: string[];
    }>;
}
export declare class EnhancedChatService {
    private readonly ragService;
    private readonly routeKnowledgeCurator;
    private readonly localInsightService;
    private readonly prisma;
    private readonly integratedRAGKPU?;
    private readonly logger;
    constructor(ragService: RagService, routeKnowledgeCurator: RouteKnowledgeCurator, localInsightService: LocalInsightService, prisma: PrismaService, integratedRAGKPU?: IntegratedRAGKPUService);
    answerRouteQuestion(question: string, context: RouteQuestionContext): Promise<EnhancedAnswer>;
    private answerFromStructuredData;
    private answerWithRAG;
    explainWhyNotOtherRoute(selectedRouteId: string, alternativeRouteId: string, countryCode: string): Promise<EnhancedAnswer>;
    answerRouteDetailQuestion(question: string, context: RouteQuestionContext): Promise<EnhancedAnswer>;
    getRouteNarrative(routeDirectionId: string, countryCode?: string): Promise<{
        narrative?: any;
        localInsights?: any[];
    }>;
    private extractTagsFromQuestion;
}
