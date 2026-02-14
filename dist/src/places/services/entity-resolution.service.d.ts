import { PrismaService } from '../../prisma/prisma.service';
import { VectorSearchService } from './vector-search.service';
import { AdminDivisionService } from './admin-division.service';
import { AmapPOIService } from './amap-poi.service';
import { GooglePlacesService } from './google-places.service';
import { PlacesService } from '../places.service';
export interface EntityResolutionResult {
    id: number;
    name: string;
    nameCN: string;
    nameEN?: string | null;
    address?: string | null;
    category: string;
    lat: number;
    lng: number;
    score: number;
    source: 'keyword_match' | 'alias_match' | 'vector_search' | 'external_geocoding';
    matchReasons: string[];
    metadata?: any;
}
export declare class EntityResolutionService {
    private prisma;
    private vectorSearchService;
    private adminDivisionService;
    private amapPOIService?;
    private googlePlacesService?;
    private placesService?;
    private readonly logger;
    private readonly LOW_SCORE_THRESHOLD;
    private readonly mustHavePoiTokens;
    constructor(prisma: PrismaService, vectorSearchService: VectorSearchService, adminDivisionService: AdminDivisionService, amapPOIService?: AmapPOIService, googlePlacesService?: GooglePlacesService, placesService?: PlacesService);
    resolveEntities(query: string, mustHavePois?: string[], lat?: number, lng?: number, limit?: number): Promise<{
        results: EntityResolutionResult[];
        missingPois: string[];
        needsClarification: Array<{
            poi: string;
            options: string[];
        }>;
    }>;
    private extractStructuredEntities;
    private resolveMustHavePoi;
    private resolveMustHavePoiWithCategory;
    private keywordExactMatch;
    private aliasMatch;
    private vectorSearchWithCityScope;
    private matchesMustHavePoi;
    private tryExternalGeocoding;
    private generateClarificationOptions;
}
