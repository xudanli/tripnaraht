import { PrismaService } from '../../prisma/prisma.service';
import { RagService } from './rag.service';
import { LlmExtractionService } from './llm-extraction.service';
export interface LocalInsight {
    countryCode: string;
    region?: string;
    tags: string[];
    content: string;
    evidenceSnippets: string[];
    confidence: 'HIGH' | 'MEDIUM' | 'LOW';
    source?: string;
}
export declare class LocalInsightService {
    private readonly prisma;
    private readonly ragService;
    private readonly llmExtraction;
    private readonly logger;
    constructor(prisma: PrismaService, ragService: RagService, llmExtraction: LlmExtractionService);
    getLocalInsight(countryCode: string, tags: string[], region?: string): Promise<LocalInsight[]>;
    getInsightsByTag(countryCode: string, tag: string, region?: string): Promise<LocalInsight[]>;
    getInsightsForCountries(countryCodes: string[], tags: string[]): Promise<Map<string, LocalInsight[]>>;
    refreshLocalInsight(countryCode: string, tags: string[], region?: string): Promise<LocalInsight[]>;
    private mapToLocalInsight;
}
