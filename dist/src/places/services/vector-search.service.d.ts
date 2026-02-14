import { PrismaService } from '../../prisma/prisma.service';
import { EmbeddingService } from './embedding.service';
export interface HybridSearchResult {
    id: number;
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    category: string;
    lat?: number;
    lng?: number;
    vectorScore: number;
    keywordScore: number;
    finalScore: number;
    matchReasons: string[];
    distance?: number;
}
export declare class VectorSearchService {
    private prisma;
    private embeddingService?;
    private readonly logger;
    private dbEmbeddingDimension;
    constructor(prisma: PrismaService, embeddingService?: EmbeddingService);
    private getEmbeddingDimension;
    private detectDbEmbeddingDimension;
    private checkDimensionCompatibility;
    hybridSearch(query: string, lat?: number, lng?: number, radius?: number, category?: string, limit?: number, countryCode?: string): Promise<HybridSearchResult[]>;
    private vectorSearch;
    private extractCityName;
    private extractCities;
    extractKeywords(raw: string): {
        city: string | null;
        keywords: string[];
    };
    private keywordSearch;
    private hybridSearchMultiCity;
    private hybridSearchSingleEntity;
    private splitQueryIntoEntities;
    private extractMatchReasons;
}
