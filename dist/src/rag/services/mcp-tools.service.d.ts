import { WeatherSearchSkill } from '../../skills/weather/weather-search.skill';
import { OpeningHoursGetSkill } from '../../skills/places/opening-hours-get.skill';
import { PoiSearchSkill } from '../../skills/places/poi-search.skill';
import { WebBrowseSkill } from '../../skills/web/web-browse.skill';
import { HybridCacheService } from './hybrid-cache.service';
import { RetryHelperService } from './retry-helper.service';
export interface McpToolCall {
    tool_name: string;
    input: any;
    output_summary?: string;
    output?: any;
    success: boolean;
    latency_ms: number;
    error?: string;
}
export interface WebBrowseResult {
    url: string;
    content: string;
    title?: string;
    success: boolean;
    cached?: boolean;
}
export interface GooglePlacesResult {
    place_id: string;
    name: string;
    opening_hours?: {
        open_now?: boolean;
        weekday_text?: string[];
        periods?: Array<{
            open: {
                day: number;
                time: string;
            };
            close: {
                day: number;
                time: string;
            };
        }>;
    };
    success: boolean;
    cached?: boolean;
}
export interface RoadStatusResult {
    road_id: string;
    status: 'OPEN' | 'CLOSED' | 'DIFFICULT' | 'IMPASSABLE';
    conditions?: string[];
    last_updated: string;
    success: boolean;
    cached?: boolean;
}
export interface WeatherResult {
    location: string;
    timestamp: string;
    temperature?: number;
    conditions?: string;
    wind_speed?: number;
    visibility?: number;
    warnings?: string[];
    success: boolean;
    cached?: boolean;
}
export declare class McpToolsService {
    private readonly weatherSkill?;
    private readonly openingHoursSkill?;
    private readonly poiSearchSkill?;
    private readonly webBrowseSkill?;
    private readonly cacheService?;
    private readonly retryHelper?;
    private readonly logger;
    constructor(weatherSkill?: WeatherSearchSkill, openingHoursSkill?: OpeningHoursGetSkill, poiSearchSkill?: PoiSearchSkill, webBrowseSkill?: WebBrowseSkill, cacheService?: HybridCacheService, retryHelper?: RetryHelperService);
    webBrowse(params: {
        url: string;
        query?: string;
        cacheTtlMinutes?: number;
    }): Promise<WebBrowseResult>;
    getPlaceDetails(params: {
        place_id?: string;
        place_name?: string;
        location?: {
            lat: number;
            lng: number;
        };
        fields?: string[];
        cacheTtlMinutes?: number;
    }): Promise<GooglePlacesResult>;
    private convertToGooglePlacesFormat;
    getRoadStatus(params: {
        road_id: string;
        cacheTtlMinutes?: number;
    }): Promise<RoadStatusResult>;
    getWeather(params: {
        location: string;
        lat?: number;
        lng?: number;
        cacheTtlMinutes?: number;
    }): Promise<WeatherResult>;
    createToolCallRecord(toolName: string, input: any, output: any, success: boolean, latencyMs: number, error?: string): McpToolCall;
    clearExpiredCache(): void;
    getCacheStats(): {
        memorySize: number;
        redisConnected: boolean;
    };
}
