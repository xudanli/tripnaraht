import { PlacesService } from './places.service';
import { HotelRecommendationService } from './services/hotel-recommendation.service';
import { NaturePoiService } from './services/nature-poi.service';
import { NaturePoiMapperService } from './services/nature-poi-mapper.service';
import { NaraHintService } from './services/nara-hint.service';
import { RouteDifficultyService } from './services/route-difficulty.service';
import { UnsplashService } from './services/unsplash.service';
import { CreatePlaceDto } from './dto/create-place.dto';
import { UpdatePlaceDto } from './dto/update-place.dto';
import { HotelRecommendationDto } from './dto/hotel-recommendation.dto';
import { RouteDifficultyRequestDto } from './dto/route-difficulty.dto';
import { GetPlacesAdminQueryDto } from './dto/admin-place.dto';
import { PlaceListQueryDto } from './dto/place-list-query.dto';
import { BatchPlaceImageRequestDto, BatchPlaceImageResponseDto, SavePlaceImageRequestDto, SavePlaceImageResponseDto } from './dto/place-image.dto';
import { BatchPlaceRequestDto } from './dto/batch-place.dto';
import { PlaceCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { UploadService } from '../upload/upload.service';
export declare class PlacesController {
    private readonly placesService;
    private readonly hotelRecommendationService;
    private readonly naturePoiService;
    private readonly naturePoiMapperService;
    private readonly naraHintService;
    private readonly routeDifficultyService;
    private readonly unsplashService;
    private readonly prisma;
    private readonly uploadService;
    private readonly logger;
    constructor(placesService: PlacesService, hotelRecommendationService: HotelRecommendationService, naturePoiService: NaturePoiService, naturePoiMapperService: NaturePoiMapperService, naraHintService: NaraHintService, routeDifficultyService: RouteDifficultyService, unsplashService: UnsplashService, prisma: PrismaService, uploadService: UploadService);
    getEvidence(placeId: number, date?: string, includeWeather?: string, includeTraffic?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getNearby(lat: number, lng: number, radius?: string, type?: PlaceCategory): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getNearbyRestaurants(lat: number, lng: number, radius?: string, payment?: string): Promise<import("./dto/geo-result.dto").PlaceWithDistance[]>;
    createPlace(createPlaceDto: CreatePlaceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    createPlaceAdmin(createPlaceDto: CreatePlaceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    recommendHotels(dto: HotelRecommendationDto): Promise<import("./interfaces/hotel-strategy.interface").HotelRecommendation[]>;
    recommendHotelOptions(dto: HotelRecommendationDto): Promise<{
        options: Array<{
            id: "CONVENIENT" | "COMFORTABLE" | "BUDGET";
            name: string;
            description: string;
            pros: string[];
            cons: string[];
            hotels: import("./interfaces/hotel-strategy.interface").HotelRecommendation[];
        }>;
        recommendation?: string;
        densityAnalysis?: {
            density: "HIGH" | "MEDIUM" | "LOW";
            avgPlacesPerDay: number;
            totalDays: number;
            totalAttractions: number;
        };
    }>;
    getNearbyNaturePois(lat: number, lng: number, radius?: string, subCategory?: string): Promise<import("./interfaces/nature-poi.interface").IcelandNaturePoi[]>;
    getNaturePoisByCategory(subCategory: string, countryCode?: string, limit?: string): Promise<import("./interfaces/nature-poi.interface").IcelandNaturePoi[]>;
    mapNaturePoiToActivity(body: {
        poi: any;
        options?: {
            time?: string;
            template?: 'photoStop' | 'shortWalk' | 'halfDayHike';
            language?: 'zh-CN' | 'en';
        };
    }): Promise<import("./interfaces/nature-poi.interface").TimeSlotActivity>;
    generateNaraHint(body: {
        poi: any;
    }): Promise<import("./interfaces/nature-poi.interface").NaraHint>;
    batchMapNaturePoisToActivities(body: {
        pois: any[];
        options?: {
            time?: string;
            template?: 'photoStop' | 'shortWalk' | 'halfDayHike';
            language?: 'zh-CN' | 'en';
        };
    }): Promise<import("./interfaces/nature-poi.interface").TimeSlotActivity[]>;
    getPlacesBatch(body: {
        ids: number[];
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    semanticSearch(query: string, countryCode?: string, lat?: string, lng?: string, radius?: string, type?: PlaceCategory, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    batchSemanticSearch(body: {
        queries: string[];
        lat?: number;
        lng?: number;
        radius?: number;
        type?: PlaceCategory;
        limit?: number;
    }): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    searchPlaces(query: string, countryCode?: string, lat?: string, lng?: string, radius?: string, type?: PlaceCategory, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlacesList(query: PlaceListQueryDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    autocompletePlaces(query: string, countryCode?: string, lat?: string, lng?: string, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getRecommendedActivities(countryCode: string, category?: PlaceCategory, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getRecommendations(tripId?: string, limit?: string): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlacesAdmin(query: GetPlacesAdminQueryDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlaceAdminById(id: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updatePlaceAdmin(id: number, updatePlaceDto: UpdatePlaceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deletePlaceAdmin(id: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlacesBatchAdmin(dto: BatchPlaceRequestDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    getPlaceById(id: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    updatePlace(id: number, updatePlaceDto: UpdatePlaceDto): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    deletePlace(id: number): Promise<import("../common/dto/standard-response.dto").StandardResponse<any>>;
    calculateRouteDifficulty(request: RouteDifficultyRequestDto): Promise<import("./dto/route-difficulty.dto").RouteDifficultyResponseDto>;
    getBatchPlaceImages(request: BatchPlaceImageRequestDto): Promise<BatchPlaceImageResponseDto>;
    getImageCacheStats(): Promise<import("../common/dto/standard-response.dto").StandardResponse<{
        size: number;
        ttlMs: number;
    }>>;
    savePlaceImage(request: SavePlaceImageRequestDto): Promise<SavePlaceImageResponseDto>;
}
