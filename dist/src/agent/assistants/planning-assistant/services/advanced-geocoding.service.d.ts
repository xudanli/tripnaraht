import { GoogleMapsDirectService } from '../../../../mcp/google-maps-direct.service';
import { GeographicDataValidatorService } from '../../../../data-quality/services/geographic-data-validator.service';
export interface GeocodingResult {
    normalizedName: string;
    coordinates?: {
        lat: number;
        lng: number;
    };
    address?: string;
    city?: string;
    country?: string;
    countryCode?: string;
    timezone?: string;
    confidence: number;
    source: 'mapping' | 'cache' | 'geocoding' | 'fuzzy_match';
    metadata?: {
        administrativeLevels?: Record<string, string>;
        formattedAddress?: string;
        placeId?: string;
        types?: string[];
    };
}
export interface LocationContext {
    selectedDestination?: string;
    currentLocation?: {
        lat: number;
        lng: number;
    };
    language?: string;
    region?: string;
}
export interface GeocodingMetrics {
    totalGeocodingRequests: number;
    successfulGeocodingRequests: number;
    failedGeocodingRequests: number;
    sourceDistribution: {
        mapping: number;
        cache: number;
        geocoding: number;
        fuzzy_match: number;
    };
    confidenceDistribution: {
        high: number;
        medium: number;
        low: number;
    };
    coordinatePrecision: {
        withCoordinates: number;
        withoutCoordinates: number;
        avgDecimalPlaces: number;
    };
    performance: {
        avgLatency: number;
        p50Latency: number;
        p95Latency: number;
        p99Latency: number;
    };
    validation: {
        validatedCoordinates: number;
        invalidCoordinates: number;
        spatialRangeValidations: number;
        spatialRangeWarnings: number;
    };
    batchProcessing: {
        totalBatches: number;
        totalBatchItems: number;
        batchErrors: number;
        avgBatchSize: number;
    };
}
export declare class AdvancedGeocodingService {
    private readonly googleMapsDirectService?;
    private readonly geographicDataValidator?;
    private readonly logger;
    private readonly landmarkMap;
    private readonly relativeLocationMap;
    private readonly capitalMap;
    private readonly timezoneMap;
    private readonly geocodeCache;
    private readonly GEOCODE_CACHE_TTL;
    private readonly countryBounds;
    private readonly metrics;
    private readonly latencies;
    private readonly decimalPlaces;
    private readonly MAX_SAMPLES;
    constructor(googleMapsDirectService?: GoogleMapsDirectService, geographicDataValidator?: GeographicDataValidatorService);
    geocode(location: string, context?: LocationContext): Promise<GeocodingResult>;
    private cleanLocationName;
    private tryLandmarkRecognition;
    private tryRelativeLocation;
    private tryContextualParsing;
    private tryGoogleMapsGeocoding;
    private tryFuzzyMatching;
    private generateLocationVariations;
    private calculateSimilarity;
    private levenshteinDistance;
    private normalizeCityName;
    private cacheResult;
    batchGeocode(locations: string[], context?: LocationContext): Promise<Map<string, GeocodingResult>>;
    private validateAndNormalizeCoordinates;
    validateCoordinates(lat: number, lng: number): boolean;
    private getCountryCodeFromCountry;
    private isCoordinateInCountryBounds;
    private getTimezoneForCity;
    private recordMetrics;
    private recordLatency;
    private updatePerformanceMetrics;
    private percentile;
    private countDecimalPlaces;
    recordCoordinateValidation(valid: boolean, spatialRangeWarning?: boolean): void;
    getMetrics(): GeocodingMetrics;
    resetMetrics(): void;
    cleanExpiredCache(): void;
}
