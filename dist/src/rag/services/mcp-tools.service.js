"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
var __param = (this && this.__param) || function (paramIndex, decorator) {
    return function (target, key) { decorator(target, key, paramIndex); }
};
var McpToolsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.McpToolsService = void 0;
const common_1 = require("@nestjs/common");
const weather_search_skill_1 = require("../../skills/weather/weather-search.skill");
const opening_hours_get_skill_1 = require("../../skills/places/opening-hours-get.skill");
const poi_search_skill_1 = require("../../skills/places/poi-search.skill");
const web_browse_skill_1 = require("../../skills/web/web-browse.skill");
const hybrid_cache_service_1 = require("./hybrid-cache.service");
const retry_helper_service_1 = require("./retry-helper.service");
let McpToolsService = McpToolsService_1 = class McpToolsService {
    constructor(weatherSkill, openingHoursSkill, poiSearchSkill, webBrowseSkill, cacheService, retryHelper) {
        this.weatherSkill = weatherSkill;
        this.openingHoursSkill = openingHoursSkill;
        this.poiSearchSkill = poiSearchSkill;
        this.webBrowseSkill = webBrowseSkill;
        this.cacheService = cacheService;
        this.retryHelper = retryHelper;
        this.logger = new common_1.Logger(McpToolsService_1.name);
        this.logger.log('[McpToolsService] 初始化完成');
        if (this.weatherSkill) {
            this.logger.log('[McpToolsService] ✓ WeatherSearchSkill 已注入');
        }
        if (this.openingHoursSkill) {
            this.logger.log('[McpToolsService] ✓ OpeningHoursGetSkill 已注入');
        }
        if (this.poiSearchSkill) {
            this.logger.log('[McpToolsService] ✓ PoiSearchSkill 已注入');
        }
        if (this.webBrowseSkill) {
            this.logger.log('[McpToolsService] ✓ WebBrowseSkill 已注入');
        }
        if (this.cacheService) {
            this.logger.log('[McpToolsService] ✓ HybridCacheService 已注入');
        }
        if (this.retryHelper) {
            this.logger.log('[McpToolsService] ✓ RetryHelperService 已注入');
        }
    }
    async webBrowse(params) {
        var _a;
        const startTime = Date.now();
        const cacheKey = `web_browse:${params.url}:${params.query || ''}`;
        try {
            if (this.cacheService) {
                const cached = await this.cacheService.get(cacheKey);
                if (cached) {
                    this.logger.log(`[WebBrowse] Cache hit for ${params.url}`);
                    return { ...cached, cached: true };
                }
            }
            if (this.webBrowseSkill) {
                const operation = async () => {
                    return await this.webBrowseSkill.execute({
                        url: params.url,
                        query: params.query,
                        disableCache: false,
                        timeout: 15000,
                    });
                };
                const retryResult = this.retryHelper
                    ? await this.retryHelper.retryApiCall(operation, `web.browse:${params.url}`)
                    : await operation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));
                if (retryResult.success && retryResult.result) {
                    const browseResult = retryResult.result;
                    const result = {
                        url: browseResult.url,
                        content: browseResult.content,
                        title: browseResult.title,
                        success: true,
                        cached: browseResult.cached,
                    };
                    if (this.cacheService) {
                        await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 60) * 60);
                    }
                    this.logger.log(`[WebBrowse] ✓ 成功浏览 ${params.url} (${browseResult.duration_ms}ms, 内容长度: ${browseResult.content.length}, 重试: ${retryResult.attemptCount - 1})`);
                    return result;
                }
                else {
                    this.logger.warn(`[WebBrowse] web.browse 重试失败: ${((_a = retryResult.lastError) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error'}`);
                }
            }
            this.logger.warn(`[WebBrowse] 无法获取网页内容，WebBrowseSkill 不可用或执行失败`);
            return {
                url: params.url,
                content: '',
                success: false,
            };
        }
        catch (error) {
            this.logger.error(`[WebBrowse] Error: ${error.message}`, error.stack);
            return {
                url: params.url,
                content: '',
                success: false,
            };
        }
        finally {
            const latency = Date.now() - startTime;
            this.logger.log(`[WebBrowse] ${params.url} - ${latency}ms`);
        }
    }
    async getPlaceDetails(params) {
        var _a, _b, _c;
        const startTime = Date.now();
        const cacheKey = `google_places:${params.place_id || params.place_name}`;
        try {
            if (this.cacheService) {
                const cached = await this.cacheService.get(cacheKey);
                if (cached) {
                    this.logger.log(`[GooglePlaces] Cache hit for ${cacheKey}`);
                    return { ...cached, cached: true };
                }
            }
            if (params.place_id && this.openingHoursSkill) {
                const operation = async () => {
                    return await this.openingHoursSkill.execute({
                        poi_ids: [params.place_id],
                    });
                };
                const retryResult = this.retryHelper
                    ? await this.retryHelper.retryApiCall(operation, `opening_hours.get:${params.place_id}`)
                    : await operation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));
                if (retryResult.success && retryResult.result) {
                    const openingHoursResult = retryResult.result;
                    if (openingHoursResult.opening_hours && openingHoursResult.opening_hours.length > 0) {
                        const poiData = openingHoursResult.opening_hours[0];
                        const result = {
                            place_id: params.place_id,
                            name: params.place_name || params.place_id,
                            opening_hours: this.convertToGooglePlacesFormat(poiData.opening_hours, poiData.is_open_now),
                            success: true,
                            cached: false,
                        };
                        if (this.cacheService) {
                            await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 1440) * 60);
                        }
                        this.logger.log(`[GooglePlaces] ✓ 成功获取 place_id=${params.place_id} 的开放时间 (重试: ${retryResult.attemptCount - 1})`);
                        return result;
                    }
                }
                else {
                    this.logger.warn(`[GooglePlaces] opening_hours.get 重试失败: ${((_a = retryResult.lastError) === null || _a === void 0 ? void 0 : _a.message) || 'Unknown error'}`);
                }
            }
            if (params.place_name && this.poiSearchSkill && this.openingHoursSkill) {
                const searchOperation = async () => {
                    var _a, _b;
                    return await this.poiSearchSkill.execute({
                        query: params.place_name,
                        lat: (_a = params.location) === null || _a === void 0 ? void 0 : _a.lat,
                        lng: (_b = params.location) === null || _b === void 0 ? void 0 : _b.lng,
                        limit: 1,
                    });
                };
                const searchRetry = this.retryHelper
                    ? await this.retryHelper.retryApiCall(searchOperation, `poi.search:${params.place_name}`)
                    : await searchOperation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));
                if (searchRetry.success && searchRetry.result) {
                    const searchResult = searchRetry.result;
                    if (searchResult.pois && searchResult.pois.length > 0) {
                        const poi = searchResult.pois[0];
                        const hoursOperation = async () => {
                            return await this.openingHoursSkill.execute({
                                poi_ids: [poi.poi_id],
                            });
                        };
                        const hoursRetry = this.retryHelper
                            ? await this.retryHelper.retryApiCall(hoursOperation, `opening_hours.get:${poi.poi_id}`)
                            : await hoursOperation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));
                        if (hoursRetry.success && hoursRetry.result) {
                            const openingHoursResult = hoursRetry.result;
                            if (openingHoursResult.opening_hours && openingHoursResult.opening_hours.length > 0) {
                                const poiData = openingHoursResult.opening_hours[0];
                                const result = {
                                    place_id: poi.poi_id,
                                    name: poi.name,
                                    opening_hours: this.convertToGooglePlacesFormat(poiData.opening_hours, poiData.is_open_now),
                                    success: true,
                                    cached: false,
                                };
                                if (this.cacheService) {
                                    await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 1440) * 60);
                                }
                                this.logger.log(`[GooglePlaces] ✓ 成功获取 ${poi.name} 的开放时间 (搜索重试: ${searchRetry.attemptCount - 1}, 开放时间重试: ${hoursRetry.attemptCount - 1})`);
                                return result;
                            }
                        }
                        else {
                            this.logger.warn(`[GooglePlaces] opening_hours.get 重试失败: ${((_b = hoursRetry.lastError) === null || _b === void 0 ? void 0 : _b.message) || 'Unknown error'}`);
                        }
                    }
                }
                else {
                    this.logger.warn(`[GooglePlaces] poi.search 重试失败: ${((_c = searchRetry.lastError) === null || _c === void 0 ? void 0 : _c.message) || 'Unknown error'}`);
                }
            }
            this.logger.warn(`[GooglePlaces] 无法获取开放时间数据，Skills 不可用或查询失败`);
            const fallbackResult = {
                place_id: params.place_id || '',
                name: params.place_name || '',
                success: false,
            };
            return fallbackResult;
        }
        catch (error) {
            this.logger.error(`[GooglePlaces] Error: ${error.message}`, error.stack);
            return {
                place_id: params.place_id || '',
                name: params.place_name || '',
                success: false,
            };
        }
        finally {
            const latency = Date.now() - startTime;
            this.logger.log(`[GooglePlaces] ${cacheKey} - ${latency}ms`);
        }
    }
    convertToGooglePlacesFormat(openingHours, isOpenNow) {
        if (!openingHours)
            return undefined;
        if (openingHours.weekday_text || openingHours.periods) {
            return {
                open_now: isOpenNow,
                weekday_text: openingHours.weekday_text,
                periods: openingHours.periods,
            };
        }
        if (typeof openingHours === 'string') {
            return {
                open_now: isOpenNow,
                weekday_text: [openingHours],
            };
        }
        return undefined;
    }
    async getRoadStatus(params) {
        var _a, _b;
        const startTime = Date.now();
        const cacheKey = `road_status:${params.road_id}`;
        try {
            const cached = await ((_a = this.cacheService) === null || _a === void 0 ? void 0 : _a.get(cacheKey));
            if (cached) {
                this.logger.log(`[RoadStatus] Cache hit for ${params.road_id}`);
                return { ...cached, cached: true };
            }
            this.logger.warn(`[RoadStatus] API not yet integrated, returning mock data for ${params.road_id}`);
            const mockResult = {
                road_id: params.road_id,
                status: 'OPEN',
                conditions: ['Dry', 'Clear'],
                last_updated: new Date().toISOString(),
                success: false,
            };
            await ((_b = this.cacheService) === null || _b === void 0 ? void 0 : _b.set(cacheKey, mockResult, (params.cacheTtlMinutes || 60) * 60));
            return mockResult;
        }
        catch (error) {
            this.logger.error(`[RoadStatus] Error: ${error.message}`, error.stack);
            return {
                road_id: params.road_id,
                status: 'OPEN',
                conditions: [],
                last_updated: new Date().toISOString(),
                success: false,
            };
        }
        finally {
            const latency = Date.now() - startTime;
            this.logger.log(`[RoadStatus] ${params.road_id} - ${latency}ms`);
        }
    }
    async getWeather(params) {
        var _a, _b;
        const startTime = Date.now();
        const cacheKey = `weather:${params.location}:${params.lat},${params.lng}`;
        try {
            if (this.cacheService) {
                const cached = await this.cacheService.get(cacheKey);
                if (cached) {
                    this.logger.log(`[Weather] Cache hit for ${params.location}`);
                    return { ...cached, cached: true };
                }
            }
            if (this.weatherSkill && params.lat != null && params.lng != null) {
                const operation = async () => {
                    return await this.weatherSkill.execute({
                        lat: params.lat,
                        lng: params.lng,
                        locationName: params.location,
                        includeWindDetails: true,
                        includeAuroraInfo: false,
                    });
                };
                const retryResult = this.retryHelper
                    ? await this.retryHelper.retryApiCall(operation, `weather.search:${params.location}`)
                    : await operation().then(r => ({ result: r, success: true, attemptCount: 1, totalDuration: 0, lastError: undefined }));
                if (retryResult.success && retryResult.result) {
                    const weatherResult = retryResult.result;
                    const weather = weatherResult.weather;
                    const result = {
                        location: params.location,
                        timestamp: new Date().toISOString(),
                        temperature: weather.temperature,
                        conditions: weather.condition,
                        wind_speed: weather.windSpeed,
                        visibility: weather.visibility,
                        warnings: ((_a = weather.alerts) === null || _a === void 0 ? void 0 : _a.map(a => a.description)) || [],
                        success: true,
                        cached: false,
                    };
                    if (this.cacheService) {
                        await this.cacheService.set(cacheKey, result, (params.cacheTtlMinutes || 30) * 60);
                    }
                    this.logger.log(`[Weather] ✓ 成功获取 ${params.location} 的天气: ${weather.temperature}°C, ${weather.condition} (重试: ${retryResult.attemptCount - 1})`);
                    return result;
                }
                else {
                    this.logger.warn(`[Weather] weather.search 重试失败: ${((_b = retryResult.lastError) === null || _b === void 0 ? void 0 : _b.message) || 'Unknown error'}`);
                }
            }
            this.logger.warn(`[Weather] 无法获取天气数据，WeatherSkill 不可用或缺少坐标`);
            const fallbackResult = {
                location: params.location,
                timestamp: new Date().toISOString(),
                success: false,
            };
            return fallbackResult;
        }
        catch (error) {
            this.logger.error(`[Weather] Error: ${error.message}`, error.stack);
            return {
                location: params.location,
                timestamp: new Date().toISOString(),
                success: false,
            };
        }
        finally {
            const latency = Date.now() - startTime;
            this.logger.log(`[Weather] ${params.location} - ${latency}ms`);
        }
    }
    createToolCallRecord(toolName, input, output, success, latencyMs, error) {
        return {
            tool_name: toolName,
            input,
            output_summary: typeof output === 'string'
                ? output.substring(0, 200)
                : JSON.stringify(output).substring(0, 200),
            output,
            success,
            latency_ms: latencyMs,
            error,
        };
    }
    clearExpiredCache() {
        if (this.cacheService) {
            const count = this.cacheService.cleanupExpired();
            this.logger.debug(`[McpToolsService] 清理了 ${count} 个过期缓存`);
        }
    }
    getCacheStats() {
        if (this.cacheService) {
            return this.cacheService.getStats();
        }
        return { memorySize: 0, redisConnected: false };
    }
};
exports.McpToolsService = McpToolsService;
exports.McpToolsService = McpToolsService = McpToolsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [weather_search_skill_1.WeatherSearchSkill,
        opening_hours_get_skill_1.OpeningHoursGetSkill,
        poi_search_skill_1.PoiSearchSkill,
        web_browse_skill_1.WebBrowseSkill,
        hybrid_cache_service_1.HybridCacheService,
        retry_helper_service_1.RetryHelperService])
], McpToolsService);
//# sourceMappingURL=mcp-tools.service.js.map