import { PrismaService } from '../prisma/prisma.service';
import { Prisma, PlaceCategory } from '@prisma/client';
import { VectorSearchService } from './services/vector-search.service';
import { PlaceWithDistance } from './dto/geo-result.dto';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { AmapPOIService } from './services/amap-poi.service';
import { GooglePlacesService, GooglePlacesPOI } from './services/google-places.service';
type OverpassPOI = GooglePlacesPOI;
import { EmbeddingService } from './services/embedding.service';
import { PlaceTrailEnrichmentService } from './services/place-trail-enrichment.service';
export declare class PlacesService {
    private prisma;
    private amapPOIService;
    private googlePlacesService;
    private vectorSearchService?;
    private embeddingService?;
    private trailEnrichmentService?;
    private readonly logger;
    constructor(prisma: PrismaService, amapPOIService: AmapPOIService, googlePlacesService: GooglePlacesService, vectorSearchService?: VectorSearchService, embeddingService?: EmbeddingService, trailEnrichmentService?: PlaceTrailEnrichmentService);
    private buildSearchText;
    private updatePlaceEmbedding;
    createPlace(dto: CreatePlaceDto): Promise<{
        id: number;
        uuid: string;
        nameEN: string | null;
        category: import(".prisma/client").$Enums.PlaceCategory;
        address: string | null;
        cityId: number | null;
        metadata: Prisma.JsonValue | null;
        physicalMetadata: Prisma.JsonValue | null;
        googlePlaceId: string | null;
        rating: number | null;
        createdAt: Date;
        updatedAt: Date;
        nameCN: string;
        description: string | null;
        lastVerifiedAt: Date | null;
        dataSource: string | null;
        dataFreshness: string | null;
    }>;
    findNearby(lat: number, lng: number, radius?: number, category?: PlaceCategory): Promise<PlaceWithDistance[]>;
    findNearbyRestaurants(lat: number, lng: number, radiusMeters?: number, paymentMethod?: string): Promise<PlaceWithDistance[]>;
    private mapToDto;
    private checkIfOpen;
    enrichPlaceFromAmap(placeId: number): Promise<any>;
    batchEnrichPlacesFromAmap(placeIds?: number[], batchSize?: number, delay?: number): Promise<{
        total: number;
        success: number;
        failed: number;
        results: Array<{
            placeId: number;
            name: string;
            status: 'success' | 'failed';
            error?: string;
        }>;
    }>;
    private extractCoordinates;
    private parseOpeningHours;
    fetchAttractionsFromOverpass(countryCode: string, tourismTypes?: string[]): Promise<OverpassPOI[]>;
    importIcelandAttractionsFromOverpass(tourismTypes?: string[], cityId?: number): Promise<{
        total: number;
        created: number;
        skipped: number;
        errors: number;
        results: Array<{
            osmId: number;
            name: string;
            status: 'created' | 'skipped' | 'error';
            error?: string;
        }>;
    }>;
    findOne(id: number): Promise<{
        id: number;
        uuid: string;
        nameCN: string;
        nameEN: string;
        category: import(".prisma/client").$Enums.PlaceCategory;
        address: string;
        rating: number;
        googlePlaceId: string;
        description: any;
        location: {
            lat: number;
            lng: number;
        };
        metadata: any;
        physicalMetadata: any;
        city: {
            id: any;
            name: any;
            nameCN: any;
            nameEN: any;
            countryCode: any;
            timezone: any;
        };
        countryCode: any;
        status: {
            isOpen: boolean;
            text: string;
            hoursToday: string;
        };
        createdAt: Date;
        updatedAt: Date;
    }>;
    findBatch(ids: number[]): Promise<{
        id: number;
        uuid: string;
        nameCN: string;
        nameEN: string;
        category: import(".prisma/client").$Enums.PlaceCategory;
        address: string;
        rating: number;
        googlePlaceId: string;
        location: {
            lat: number;
            lng: number;
        };
        metadata: any;
        physicalMetadata: any;
        city: {
            id: any;
            name: any;
            nameCN: any;
            nameEN: any;
            countryCode: any;
            timezone: any;
        };
        status: {
            isOpen: boolean;
            text: string;
            hoursToday: string;
        };
        createdAt: Date;
        updatedAt: Date;
    }[]>;
    getRecommendedActivities(countryCode: string, category?: PlaceCategory, limit?: number): Promise<PlaceWithDistance[]>;
    search(query: string, lat?: number, lng?: number, radius?: number, category?: PlaceCategory, limit?: number, countryCode?: string): Promise<PlaceWithDistance[]>;
    autocomplete(query: string, lat?: number, lng?: number, limit?: number, countryCode?: string): Promise<{
        id: number;
        name: string;
        nameCN: string;
        nameEN: string;
        category: string;
        address: string;
    }[]>;
    semanticSearch(query: string, lat?: number, lng?: number, radius?: number, category?: PlaceCategory, limit?: number, countryCode?: string): Promise<Array<{
        id: number;
        nameCN: string;
        nameEN?: string | null;
        address?: string | null;
        category: string;
        matchReasons: string[];
        vectorScore: number;
        keywordScore: number;
        finalScore: number;
        distance?: number;
    }>>;
    batchSemanticSearch(queries: string[], lat?: number, lng?: number, radius?: number, category?: PlaceCategory, limit?: number): Promise<Array<{
        query: string;
        results: Array<{
            id: number;
            nameCN: string;
            nameEN?: string | null;
            address?: string | null;
            category: string;
            matchReasons: string[];
            vectorScore: number;
            keywordScore: number;
            finalScore: number;
            distance?: number;
        }>;
        total: number;
        error?: string;
    }>>;
    updatePlace(id: number, dto: UpdatePlaceDto): Promise<{
        id: number;
        uuid: string;
        nameCN: string;
        nameEN: string;
        category: import(".prisma/client").$Enums.PlaceCategory;
        address: string;
        rating: number;
        googlePlaceId: string;
        description: any;
        location: {
            lat: number;
            lng: number;
        };
        metadata: any;
        physicalMetadata: any;
        city: {
            id: any;
            name: any;
            nameCN: any;
            nameEN: any;
            countryCode: any;
            timezone: any;
        };
        countryCode: any;
        status: {
            isOpen: boolean;
            text: string;
            hoursToday: string;
        };
        createdAt: Date;
        updatedAt: Date;
    }>;
    deletePlace(id: number): Promise<{
        success: boolean;
    }>;
    getPlacesAdmin(params: {
        page?: number;
        limit?: number;
        search?: string;
        category?: PlaceCategory;
        cityId?: number;
        countryCode?: string;
    }): Promise<{
        places: {
            id: number;
            uuid: string;
            nameCN: string;
            nameEN: string;
            category: import(".prisma/client").$Enums.PlaceCategory;
            address: string;
            rating: number;
            googlePlaceId: string;
            description: any;
            location: {
                lat: number;
                lng: number;
            };
            metadata: any;
            physicalMetadata: any;
            city: {
                id: number;
                name: string;
                nameCN: string;
                nameEN: string;
                countryCode: string;
                timezone: string;
            };
            countryCode: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    }>;
    getPlacesList(params: {
        page?: number;
        limit?: number;
        category?: PlaceCategory;
        cityId?: number;
        orderBy?: 'id' | 'rating' | 'createdAt' | 'updatedAt';
        orderDirection?: 'asc' | 'desc';
    }): Promise<{
        places: {
            id: number;
            uuid: string;
            nameCN: string;
            nameEN: string;
            category: import(".prisma/client").$Enums.PlaceCategory;
            address: string;
            rating: number;
            googlePlaceId: string;
            description: any;
            location: {
                lat: number;
                lng: number;
            };
            metadata: any;
            physicalMetadata: any;
            city: {
                id: number;
                name: string;
                nameCN: string;
                nameEN: string;
                countryCode: string;
                timezone: string;
            };
            countryCode: string;
            createdAt: Date;
            updatedAt: Date;
        }[];
        page: number;
        limit: number;
        total: number;
        totalPages: number;
        hasPrev: boolean;
        hasNext: boolean;
    }>;
    getPlacesByCountryCode(params: {
        countryCode: string;
        category?: PlaceCategory;
        search?: string;
        page?: number;
        limit?: number;
    }): Promise<{
        places: {
            id: number;
            uuid: string;
            nameCN: string;
            nameEN: string;
            category: import(".prisma/client").$Enums.PlaceCategory;
            rating: number;
            location: {
                lat: number;
                lng: number;
            };
            city: {
                id: number;
                name: string;
                countryCode: string;
            };
        }[];
        total: number;
        page: number;
        limit: number;
    }>;
    getPlacesByIds(ids: number[]): Promise<{
        id: number;
        uuid: string;
        nameCN: string;
        nameEN: string;
        category: import(".prisma/client").$Enums.PlaceCategory;
        rating: number;
        address: string;
        description: any;
        location: {
            lat: number;
            lng: number;
        };
        metadata: any;
        city: {
            id: number;
            name: string;
            countryCode: string;
        };
    }[]>;
}
export {};
