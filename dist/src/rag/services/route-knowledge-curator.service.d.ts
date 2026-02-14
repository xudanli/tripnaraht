import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { LlmExtractionService } from './llm-extraction.service';
export interface RoutePhilosophyNarrative {
    routeDirectionId: string;
    philosophyExplanation: string;
    whyThisRoute: string[];
    whatToExpect: string[];
    commonMistakes: string[];
    evidenceSnippets: string[];
}
export interface SegmentNarrative {
    segmentId: string;
    dayIndex: number;
    storyText: string;
    practicalTips: string[];
    localInsights: string[];
    evidenceSnippets: string[];
}
export declare class RouteKnowledgeCurator {
    private readonly prisma;
    private readonly ragService;
    private readonly llmExtraction;
    private readonly logger;
    constructor(prisma: PrismaService, ragService: RagService, llmExtraction: LlmExtractionService);
    enrichRouteNarrative(routeDirectionId: string, countryCode?: string): Promise<RoutePhilosophyNarrative>;
    private generateBasicNarrative;
    enrichSegmentNarrative(segmentId: string, dayIndex: number, segmentInfo: {
        name?: string;
        description?: string;
        countryCode?: string;
    }): Promise<SegmentNarrative>;
    enrichMultipleRoutes(routeDirectionIds: string[], countryCode?: string): Promise<RoutePhilosophyNarrative[]>;
}
