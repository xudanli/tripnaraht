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
var PlacesController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlacesController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const places_service_1 = require("./places.service");
const hotel_recommendation_service_1 = require("./services/hotel-recommendation.service");
const nature_poi_service_1 = require("./services/nature-poi.service");
const nature_poi_mapper_service_1 = require("./services/nature-poi-mapper.service");
const nara_hint_service_1 = require("./services/nara-hint.service");
const route_difficulty_service_1 = require("./services/route-difficulty.service");
const unsplash_service_1 = require("./services/unsplash.service");
const create_place_dto_1 = require("./dto/create-place.dto");
const update_place_dto_1 = require("./dto/update-place.dto");
const hotel_recommendation_dto_1 = require("./dto/hotel-recommendation.dto");
const route_difficulty_dto_1 = require("./dto/route-difficulty.dto");
const admin_place_dto_1 = require("./dto/admin-place.dto");
const place_list_query_dto_1 = require("./dto/place-list-query.dto");
const place_image_dto_1 = require("./dto/place-image.dto");
const batch_place_dto_1 = require("./dto/batch-place.dto");
const client_1 = require("@prisma/client");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const prisma_service_1 = require("../prisma/prisma.service");
const upload_service_1 = require("../upload/upload.service");
const opening_hours_util_1 = require("../common/utils/opening-hours.util");
let PlacesController = PlacesController_1 = class PlacesController {
    constructor(placesService, hotelRecommendationService, naturePoiService, naturePoiMapperService, naraHintService, routeDifficultyService, unsplashService, prisma, uploadService) {
        this.placesService = placesService;
        this.hotelRecommendationService = hotelRecommendationService;
        this.naturePoiService = naturePoiService;
        this.naturePoiMapperService = naturePoiMapperService;
        this.naraHintService = naraHintService;
        this.routeDifficultyService = routeDifficultyService;
        this.unsplashService = unsplashService;
        this.prisma = prisma;
        this.uploadService = uploadService;
        this.logger = new common_1.Logger(PlacesController_1.name);
    }
    async getEvidence(placeId, date, includeWeather, includeTraffic) {
        var _a, _b;
        try {
            const place = await this.placesService.findOne(placeId);
            if (!place) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `地点 ID ${placeId} 不存在`);
            }
            const metadata = place.metadata || {};
            const shouldIncludeWeather = includeWeather !== 'false';
            const shouldIncludeTraffic = includeTraffic !== 'false';
            const targetDate = date || new Date().toISOString().split('T')[0];
            let businessHours = undefined;
            if (metadata.openingHours || metadata.opening_hours) {
                const openingHours = metadata.openingHours || metadata.opening_hours;
                const timezone = metadata.timezone || 'Asia/Tokyo';
                const todayHours = opening_hours_util_1.OpeningHoursUtil.getTodayHours(metadata, timezone);
                businessHours = {
                    open: todayHours !== 'Closed' ? (_a = todayHours.split('-')[0]) === null || _a === void 0 ? void 0 : _a.trim() : undefined,
                    close: todayHours !== 'Closed' ? (_b = todayHours.split('-')[1]) === null || _b === void 0 ? void 0 : _b.trim() : undefined,
                    timezone: timezone,
                    exceptions: [],
                };
            }
            let roadClosure = { hasClosure: false };
            if (shouldIncludeTraffic && (metadata.roadStatus || metadata.roadClosure)) {
                const roadStatus = metadata.roadStatus || {};
                roadClosure = {
                    hasClosure: metadata.roadClosure === true || roadStatus.closed === true,
                    closures: roadStatus.closures || [],
                };
            }
            let weatherWindow = undefined;
            if (shouldIncludeWeather && (metadata.weatherInfo || metadata.weather)) {
                const weatherInfo = metadata.weatherInfo || metadata.weather || {};
                weatherWindow = {
                    date: targetDate,
                    condition: weatherInfo.condition || weatherInfo.weather || '未知',
                    description: weatherInfo.description || `${weatherInfo.condition || '未知'}，${weatherInfo.temperature ? `温度${weatherInfo.temperature}°C` : ''}`,
                    temperature: {
                        min: weatherInfo.tempMin || weatherInfo.temperature_min || undefined,
                        max: weatherInfo.tempMax || weatherInfo.temperature_max || weatherInfo.temperature || undefined,
                        unit: 'celsius',
                    },
                    precipitation: weatherInfo.precipitation ? {
                        probability: weatherInfo.precipitation.probability || weatherInfo.precipitation_probability || undefined,
                        amount: weatherInfo.precipitation.amount || weatherInfo.precipitation_amount || undefined,
                    } : undefined,
                    wind: weatherInfo.wind ? {
                        speed: weatherInfo.wind.speed || weatherInfo.wind_speed || undefined,
                        direction: weatherInfo.wind.direction || weatherInfo.wind_direction || undefined,
                    } : undefined,
                    suitableForOutdoor: weatherInfo.suitableForOutdoor !== false,
                };
            }
            const otherInfo = {};
            if (metadata.crowdLevel) {
                otherInfo.crowdLevel = metadata.crowdLevel;
            }
            if (metadata.specialEvents) {
                otherInfo.specialEvents = metadata.specialEvents;
            }
            return (0, standard_response_dto_1.successResponse)({
                placeId: place.id,
                placeName: place.nameCN || place.nameEN || '未知地点',
                evidence: {
                    businessHours,
                    roadClosure,
                    weatherWindow,
                    otherInfo: Object.keys(otherInfo).length > 0 ? otherInfo : undefined,
                },
            });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            throw error;
        }
    }
    async getNearby(lat, lng, radius, type) {
        try {
            const radiusMeters = radius ? parseFloat(radius) : 2000;
            const places = await this.placesService.findNearby(lat, lng, radiusMeters, type);
            return (0, standard_response_dto_1.successResponse)(places);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async getNearbyRestaurants(lat, lng, radius, payment) {
        const radiusMeters = radius ? parseFloat(radius) : 1000;
        return this.placesService.findNearbyRestaurants(lat, lng, radiusMeters, payment);
    }
    async createPlace(createPlaceDto) {
        try {
            const place = await this.placesService.createPlace(createPlaceDto);
            return (0, standard_response_dto_1.successResponse)(place);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async createPlaceAdmin(createPlaceDto) {
        var _a, _b;
        try {
            const place = await this.placesService.createPlace(createPlaceDto);
            return (0, standard_response_dto_1.successResponse)(place);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            if ((error === null || error === void 0 ? void 0 : error.code) === 'P2002') {
                const field = ((_b = (_a = error.meta) === null || _a === void 0 ? void 0 : _a.target) === null || _b === void 0 ? void 0 : _b[0]) || '字段';
                const message = field === 'googlePlaceId'
                    ? `Google Place ID 已存在: ${createPlaceDto.googlePlaceId}`
                    : `唯一约束冲突: ${field} 已存在`;
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, message);
            }
            this.logger.error(`创建地点失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async recommendHotels(dto) {
        return this.hotelRecommendationService.recommendHotels({
            tripId: dto.tripId,
            attractionIds: dto.attractionIds,
            strategy: dto.strategy,
            maxBudget: dto.maxBudget,
            minTier: dto.minTier,
            maxTier: dto.maxTier,
            timeValuePerHour: dto.timeValuePerHour || 50,
            includeHiddenCost: dto.includeHiddenCost !== false,
        });
    }
    async recommendHotelOptions(dto) {
        return this.hotelRecommendationService.recommendHotelOptions({
            tripId: dto.tripId,
            attractionIds: dto.attractionIds,
            maxBudget: dto.maxBudget,
            minTier: dto.minTier,
            maxTier: dto.maxTier,
            timeValuePerHour: dto.timeValuePerHour || 50,
            includeHiddenCost: dto.includeHiddenCost !== false,
        });
    }
    async getNearbyNaturePois(lat, lng, radius, subCategory) {
        const radiusMeters = radius ? parseFloat(radius) : 5000;
        return this.naturePoiService.findNaturePoisByArea({ lat, lng }, radiusMeters, subCategory);
    }
    async getNaturePoisByCategory(subCategory, countryCode, limit) {
        const limitNum = limit ? parseInt(limit, 10) : 100;
        return this.naturePoiService.findNaturePoisByCategory(subCategory, countryCode, limitNum);
    }
    async mapNaturePoiToActivity(body) {
        return this.naturePoiMapperService.mapNaturePoiToActivitySlot(body.poi, body.options);
    }
    async generateNaraHint(body) {
        return this.naraHintService.generateNaraHint(body.poi);
    }
    async batchMapNaturePoisToActivities(body) {
        return this.naturePoiMapperService.mapMultiplePoisToActivities(body.pois, body.options);
    }
    async getPlacesBatch(body) {
        if (!body.ids || !Array.isArray(body.ids) || body.ids.length === 0) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'ids 必须是非空数组');
        }
        const places = await this.placesService.findBatch(body.ids);
        return (0, standard_response_dto_1.successResponse)(places);
    }
    async semanticSearch(query, countryCode, lat, lng, radius, type, limit) {
        if (!query) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '搜索查询不能为空');
        }
        try {
            const latNum = lat ? parseFloat(lat) : undefined;
            const lngNum = lng ? parseFloat(lng) : undefined;
            const radiusNum = radius ? parseFloat(radius) : undefined;
            const limitNum = limit ? parseInt(limit, 10) : 20;
            const results = await this.placesService.semanticSearch(query, latNum, lngNum, radiusNum, type, limitNum, countryCode);
            return (0, standard_response_dto_1.successResponse)({
                results,
                total: results.length,
            });
        }
        catch (error) {
            this.logger.error(`语义搜索失败: ${error.message}`);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `语义搜索失败: ${error.message}`);
        }
    }
    async batchSemanticSearch(body) {
        if (!body.queries || !Array.isArray(body.queries) || body.queries.length === 0) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'queries 必须是非空数组');
        }
        if (body.queries.length > 20) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'queries 数组最多支持 20 个查询');
        }
        try {
            const results = await this.placesService.batchSemanticSearch(body.queries, body.lat, body.lng, body.radius, body.type, body.limit || 20);
            return (0, standard_response_dto_1.successResponse)(results);
        }
        catch (error) {
            this.logger.error(`批量语义搜索失败: ${error.message}`);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `批量语义搜索失败: ${error.message}`);
        }
    }
    async searchPlaces(query, countryCode, lat, lng, radius, type, limit) {
        if (!query) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '搜索关键词不能为空');
        }
        const latNum = lat ? parseFloat(lat) : undefined;
        const lngNum = lng ? parseFloat(lng) : undefined;
        const radiusNum = radius ? parseFloat(radius) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : 20;
        const places = await this.placesService.search(query, latNum, lngNum, radiusNum, type, limitNum, countryCode);
        return (0, standard_response_dto_1.successResponse)(places);
    }
    async getPlacesList(query) {
        try {
            const result = await this.placesService.getPlacesList({
                page: query.page,
                limit: query.limit,
                category: query.category,
                cityId: query.cityId,
                orderBy: query.orderBy,
                orderDirection: query.orderDirection,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取地点列表失败: ${error.message}`);
        }
    }
    async autocompletePlaces(query, countryCode, lat, lng, limit) {
        if (!query) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '搜索关键词不能为空');
        }
        const latNum = lat ? parseFloat(lat) : undefined;
        const lngNum = lng ? parseFloat(lng) : undefined;
        const limitNum = limit ? parseInt(limit, 10) : 10;
        const suggestions = await this.placesService.autocomplete(query, latNum, lngNum, limitNum, countryCode);
        return (0, standard_response_dto_1.successResponse)(suggestions);
    }
    async getRecommendedActivities(countryCode, category, limit) {
        try {
            if (!countryCode) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '国家代码不能为空');
            }
            const limitNum = limit ? parseInt(limit, 10) : 20;
            if (isNaN(limitNum) || limitNum < 1 || limitNum > 100) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, 'limit 参数必须在 1-100 之间');
            }
            const allowedCategories = ['ATTRACTION', 'RESTAURANT', 'SHOPPING', 'HOTEL'];
            const validCategory = category && allowedCategories.includes(category)
                ? category
                : undefined;
            const places = await this.placesService.getRecommendedActivities(countryCode, validCategory, limitNum);
            return (0, standard_response_dto_1.successResponse)(places);
        }
        catch (error) {
            this.logger.error('获取推荐活动失败:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取推荐活动失败');
        }
    }
    async getRecommendations(tripId, limit) {
        return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNSUPPORTED_ACTION, '地点推荐功能已废弃，请使用 /api/places/search/semantic 进行语义搜索。');
    }
    async getPlacesAdmin(query) {
        try {
            const limit = query.limit && query.limit > 100 ? 100 : query.limit;
            const result = await this.placesService.getPlacesAdmin({
                page: query.page,
                limit,
                search: query.search,
                category: query.category,
                cityId: query.cityId,
                countryCode: query.countryCode,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取地点列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPlaceAdminById(id) {
        try {
            const place = await this.placesService.findOne(id);
            if (!place) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `地点 ID ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(place);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async updatePlaceAdmin(id, updatePlaceDto) {
        try {
            const place = await this.placesService.updatePlace(id, updatePlaceDto);
            return (0, standard_response_dto_1.successResponse)(place);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`更新地点失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async deletePlaceAdmin(id) {
        try {
            await this.placesService.deletePlace(id);
            return (0, standard_response_dto_1.successResponse)({ message: '地点删除成功', id });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`删除地点失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPlacesBatchAdmin(dto) {
        try {
            const places = await this.placesService.getPlacesByIds(dto.ids);
            return (0, standard_response_dto_1.successResponse)({ places });
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            this.logger.error(`批量获取POI详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPlaceById(id) {
        const place = await this.placesService.findOne(id);
        if (!place) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `地点 ID ${id} 不存在`);
        }
        return (0, standard_response_dto_1.successResponse)(place);
    }
    async updatePlace(id, updatePlaceDto) {
        try {
            const place = await this.placesService.updatePlace(id, updatePlaceDto);
            return (0, standard_response_dto_1.successResponse)(place);
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async deletePlace(id) {
        try {
            await this.placesService.deletePlace(id);
            return (0, standard_response_dto_1.successResponse)({ message: 'Place deleted successfully' });
        }
        catch (error) {
            if (error instanceof common_1.NotFoundException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, error.message);
            }
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async calculateRouteDifficulty(request) {
        return this.routeDifficultyService.calculateDifficulty(request);
    }
    async getBatchPlaceImages(request) {
        this.logger.debug(`[批量图片] 请求 ${request.places.length} 个地点的图片`);
        const result = await this.unsplashService.getBatchPlaceImages(request.places.map(p => ({
            placeId: p.placeId,
            placeName: p.placeName,
            placeNameEn: p.placeNameEn,
            country: p.country,
            category: p.category ? (place_image_dto_1.CATEGORY_MAP[p.category] || 'landmark') : undefined,
        })));
        this.logger.debug(`[批量图片] 完成: 总计=${result.stats.total}, 成功=${result.stats.found}, ` +
            `缓存=${result.stats.cached}, 失败=${result.stats.failed}, 耗时=${result.processingTimeMs}ms`);
        return result;
    }
    async getImageCacheStats() {
        return (0, standard_response_dto_1.successResponse)(this.unsplashService.getCacheStats());
    }
    async savePlaceImage(request) {
        const place = await this.prisma.place.findUnique({
            where: { id: request.placeId },
        });
        if (!place) {
            throw new common_1.NotFoundException(`地点不存在: ID ${request.placeId}`);
        }
        if (!this.uploadService.isAvailable()) {
            throw new common_1.BadRequestException('OSS 未配置，无法保存图片到 OSS');
        }
        const currentMetadata = place.metadata || {};
        const existingImages = currentMetadata.images || [];
        this.logger.log(`[保存图片] 开始下载并上传图片到 OSS: 地点 ID=${request.placeId}, Unsplash ID=${request.photo.id}`);
        let ossResult;
        try {
            ossResult = await this.uploadService.uploadImageFromUrl(request.photo.urls.regular, `places/${request.placeId}`, `unsplash-${request.photo.id}.jpg`);
        }
        catch (error) {
            this.logger.error(`[保存图片] OSS 上传失败: ${error.message}`);
            throw new common_1.BadRequestException(`图片上传到 OSS 失败: ${error.message}`);
        }
        const newImage = {
            url: ossResult.url,
            key: ossResult.key,
            caption: request.photo.description || request.photo.altDescription || '',
            source: 'unsplash',
            isPrimary: existingImages.length === 0 || request.isPrimary === true,
            savedAt: new Date().toISOString(),
            unsplash: {
                id: request.photo.id,
                width: request.photo.width,
                height: request.photo.height,
                color: request.photo.color,
                blurHash: request.photo.blurHash,
                originalUrl: request.photo.urls.regular,
                urls: request.photo.urls,
                attribution: request.photo.attribution,
                photographer: {
                    name: request.photo.user.name,
                    username: request.photo.user.username,
                    link: request.photo.user.link,
                },
            },
        };
        if (newImage.isPrimary && existingImages.length > 0) {
            existingImages.forEach((img) => {
                img.isPrimary = false;
            });
        }
        const updatedMetadata = {
            ...currentMetadata,
            images: [...existingImages, newImage],
        };
        await this.prisma.place.update({
            where: { id: request.placeId },
            data: { metadata: updatedMetadata },
        });
        this.logger.log(`[保存图片] 完成: 地点 ID=${request.placeId}, OSS Key=${ossResult.key}, 总图片数=${updatedMetadata.images.length}`);
        return {
            success: true,
            placeId: request.placeId,
            placeName: place.nameCN,
            savedImage: {
                url: newImage.url,
                caption: newImage.caption,
                source: newImage.source,
                isPrimary: newImage.isPrimary,
                savedAt: newImage.savedAt,
                attribution: request.photo.attribution,
            },
            totalImages: updatedMetadata.images.length,
        };
    }
};
exports.PlacesController = PlacesController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':placeId/evidence'),
    (0, swagger_1.ApiOperation)({
        summary: '获取地点的关键证据',
        description: '获取地点的关键证据信息（营业时间、封路信息、天气窗口等）',
    }),
    (0, swagger_1.ApiParam)({ name: 'placeId', description: '地点ID', type: Number, example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'date', description: '指定日期（YYYY-MM-DD）', required: false, example: '2026-02-05' }),
    (0, swagger_1.ApiQuery)({ name: 'includeWeather', description: '是否包含天气信息', required: false, type: Boolean, example: true }),
    (0, swagger_1.ApiQuery)({ name: 'includeTraffic', description: '是否包含交通信息', required: false, type: Boolean, example: true }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回关键证据',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '地点不存在' }),
    __param(0, (0, common_1.Param)('placeId', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Query)('date')),
    __param(2, (0, common_1.Query)('includeWeather')),
    __param(3, (0, common_1.Query)('includeTraffic')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, String, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getEvidence", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('nearby'),
    (0, swagger_1.ApiOperation)({
        summary: '查找附近的地点',
        description: '根据经纬度查找指定半径内的地点，支持按类别筛选。使用 PostGIS 进行地理位置计算。'
    }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', example: 34.6937, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', example: 135.5023, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'radius', description: '搜索半径（米）', example: 2000, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({
        name: 'type',
        description: '地点类型',
        enum: client_1.PlaceCategory,
        required: false
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回附近地点列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('lat', common_1.ParseFloatPipe)),
    __param(1, (0, common_1.Query)('lng', common_1.ParseFloatPipe)),
    __param(2, (0, common_1.Query)('radius')),
    __param(3, (0, common_1.Query)('type')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getNearby", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('nearby/restaurants'),
    (0, swagger_1.ApiOperation)({
        summary: '查找附近的餐厅',
        description: '查找指定半径内的餐厅，支持按支付方式筛选（如 Visa、Alipay 等）'
    }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', example: 34.6937, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', example: 135.5023, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'radius', description: '搜索半径（米）', example: 1000, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'payment', description: '支付方式（如 Visa、Alipay）', example: 'Visa', required: false }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回附近餐厅列表' }),
    __param(0, (0, common_1.Query)('lat', common_1.ParseFloatPipe)),
    __param(1, (0, common_1.Query)('lng', common_1.ParseFloatPipe)),
    __param(2, (0, common_1.Query)('radius')),
    __param(3, (0, common_1.Query)('payment')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getNearbyRestaurants", null);
__decorate([
    (0, common_1.Post)(),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 创建地点',
        description: '⚠️ 已废弃，请使用 POST /places/admin。创建新的地点记录，包括地理位置（PostGIS）和元数据（JSONB）'
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '地点创建成功（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_place_dto_1.CreatePlaceDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "createPlace", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin'),
    (0, swagger_1.ApiOperation)({
        summary: '创建地点（管理接口）',
        description: '创建新的地点记录，包括地理位置（PostGIS）和元数据（JSONB）。管理接口，无需认证。',
    }),
    (0, swagger_1.ApiBody)({ type: create_place_dto_1.CreatePlaceDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '地点创建成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [create_place_dto_1.CreatePlaceDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "createPlaceAdmin", null);
__decorate([
    (0, common_1.Post)('hotels/recommend'),
    (0, swagger_1.ApiOperation)({
        summary: '推荐酒店（综合隐形成本 + AI 自动平衡）',
        description: '根据行程或景点列表推荐合适的酒店，支持三种策略：\n' +
            '- CENTROID（重心法）：适合"特种兵"，找所有景点的地理中心点\n' +
            '- HUB（交通枢纽法）：适合"大多数人"，优先选择离地铁站近的\n' +
            '- RESORT（度假模式）：适合"躺平"，牺牲距离换取档次\n\n' +
            '**AI 自动平衡**：如果未指定策略且提供了 tripId，系统会根据行程密度自动选择策略：\n' +
            '- 高密度（每天 ≥4 个景点）→ CENTROID（市中心 3 星）\n' +
            '- 中密度（每天 2-3 个景点）→ HUB（交通枢纽）\n' +
            '- 低密度（每天 ≤1 个景点）→ RESORT（偏远 4-5 星）\n\n' +
            '**时间价值自动计算**：如果未指定 timeValuePerHour 且提供了 tripId，系统会根据以下因素自动计算：\n' +
            '- 预算水平（总预算 / 行程天数 / 人数）\n' +
            '- 旅行者类型（成年人、老人、儿童）\n' +
            '- 行程密度（高密度行程时间价值更高）\n' +
            '- 时间敏感度（商务旅行 vs 休闲旅行）\n\n' +
            '系统会自动计算综合成本（房价 + 交通费 + 时间成本），帮助用户看到隐形成本。',
    }),
    (0, swagger_1.ApiBody)({
        type: hotel_recommendation_dto_1.HotelRecommendationDto,
        description: '酒店推荐请求参数',
        examples: {
            centroid: {
                summary: '重心法示例',
                value: {
                    tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
                    strategy: 'CENTROID',
                    maxBudget: 2000,
                    includeHiddenCost: true,
                    timeValuePerHour: 50,
                },
            },
            hub: {
                summary: '交通枢纽法示例',
                value: {
                    tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
                    strategy: 'HUB',
                    maxBudget: 1500,
                    minTier: 3,
                    includeHiddenCost: true,
                },
            },
            resort: {
                summary: '度假模式示例',
                value: {
                    attractionIds: [1, 2, 3],
                    strategy: 'RESORT',
                    minTier: 4,
                    includeHiddenCost: false,
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回酒店推荐列表',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    hotelId: { type: 'number', example: 1 },
                    name: { type: 'string', example: '新宿希尔顿酒店' },
                    roomRate: { type: 'number', example: 1500 },
                    tier: { type: 'number', example: 4 },
                    totalCost: { type: 'number', example: 1528.33 },
                    costBreakdown: {
                        type: 'object',
                        properties: {
                            roomRate: { type: 'number', example: 1500 },
                            transportCost: { type: 'number', example: 20 },
                            timeCost: { type: 'number', example: 8.33 },
                            hiddenCost: { type: 'number', example: 28.33 },
                            totalCost: { type: 'number', example: 1528.33 },
                        },
                    },
                    recommendationReason: { type: 'string', example: '交通枢纽法：距离地铁站近，交通便利' },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '未找到行程或景点信息' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [hotel_recommendation_dto_1.HotelRecommendationDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "recommendHotels", null);
__decorate([
    (0, common_1.Post)('hotels/recommend-options'),
    (0, swagger_1.ApiOperation)({
        summary: '推荐酒店选项（三个区域选项）',
        description: '返回三个酒店推荐选项，每个选项标注优缺点，供用户选择：\n\n' +
            '1. **核心方便区**（CONVENIENT）\n' +
            '   - 特点：住在市中心，出门就是地铁，交通便利\n' +
            '   - 代价：房间可能较小，或是预算内只能住 3 星\n\n' +
            '2. **舒适享受区**（COMFORTABLE）\n' +
            '   - 特点：房间大，档次高（4-5 星），适合休闲度假\n' +
            '   - 代价：距离市区较远，每天去市区需坐车 40 分钟以上\n\n' +
            '3. **极限省钱区**（BUDGET）\n' +
            '   - 特点：价格极低，适合预算有限的旅行者\n' +
            '   - 代价：可能距离景点较远，每天通勤 1 小时以上\n\n' +
            '如果提供了 tripId，系统还会分析行程密度并给出 AI 推荐建议。',
    }),
    (0, swagger_1.ApiBody)({
        type: hotel_recommendation_dto_1.HotelRecommendationDto,
        description: '酒店推荐请求参数',
        examples: {
            withTrip: {
                summary: '基于行程的推荐',
                value: {
                    tripId: 'f3626ff1-7a9b-46d9-8b8b-7f53a14583b1',
                    includeHiddenCost: true,
                    timeValuePerHour: 50,
                },
            },
            withAttractions: {
                summary: '基于景点列表的推荐',
                value: {
                    attractionIds: [47, 48, 49, 50, 51],
                    includeHiddenCost: true,
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回三个酒店推荐选项',
        schema: {
            type: 'object',
            properties: {
                options: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            id: { type: 'string', enum: ['CONVENIENT', 'COMFORTABLE', 'BUDGET'] },
                            name: { type: 'string', example: '核心方便区' },
                            description: { type: 'string', example: '住在市中心，出门就是地铁，交通便利' },
                            pros: { type: 'array', items: { type: 'string' } },
                            cons: { type: 'array', items: { type: 'string' } },
                            hotels: { type: 'array', items: { type: 'object' } },
                        },
                    },
                },
                recommendation: { type: 'string', example: '检测到高密度行程...' },
                densityAnalysis: {
                    type: 'object',
                    properties: {
                        density: { type: 'string', enum: ['HIGH', 'MEDIUM', 'LOW'] },
                        avgPlacesPerDay: { type: 'number' },
                        totalDays: { type: 'number' },
                        totalAttractions: { type: 'number' },
                    },
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '未找到行程或景点信息' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [hotel_recommendation_dto_1.HotelRecommendationDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "recommendHotelOptions", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('nature-poi/nearby'),
    (0, swagger_1.ApiOperation)({
        summary: '查找附近的自然 POI',
        description: '根据中心点和半径查找附近的自然 POI（火山、冰川、瀑布等）',
    }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'radius', description: '搜索半径（米）', example: 5000, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({
        name: 'subCategory',
        description: '子类别过滤（可选）',
        example: 'volcano',
        required: false,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回自然 POI 列表' }),
    __param(0, (0, common_1.Query)('lat', common_1.ParseFloatPipe)),
    __param(1, (0, common_1.Query)('lng', common_1.ParseFloatPipe)),
    __param(2, (0, common_1.Query)('radius')),
    __param(3, (0, common_1.Query)('subCategory')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, Number, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getNearbyNaturePois", null);
__decorate([
    (0, common_1.Get)('nature-poi/category/:subCategory'),
    (0, swagger_1.ApiOperation)({
        summary: '按类别查找自然 POI',
        description: '根据子类别查找自然 POI（如 volcano, glacier, waterfall 等）',
    }),
    (0, swagger_1.ApiParam)({
        name: 'subCategory',
        description: '子类别',
        example: 'volcano',
        type: String,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'countryCode',
        description: '国家代码（可选）',
        example: 'IS',
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '返回数量限制',
        example: 100,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回自然 POI 列表' }),
    __param(0, (0, common_1.Param)('subCategory')),
    __param(1, (0, common_1.Query)('countryCode')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getNaturePoisByCategory", null);
__decorate([
    (0, common_1.Post)('nature-poi/map-to-activity'),
    (0, swagger_1.ApiOperation)({
        summary: '将自然 POI 映射为活动时间片',
        description: '将自然 POI 转换为 TimeSlotActivity 格式，用于行程生成',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                poi: {
                    type: 'object',
                    description: '自然 POI 对象',
                },
                options: {
                    type: 'object',
                    properties: {
                        time: { type: 'string', example: '09:30' },
                        template: { type: 'string', enum: ['photoStop', 'shortWalk', 'halfDayHike'] },
                        language: { type: 'string', enum: ['zh-CN', 'en'] },
                    },
                },
            },
            required: ['poi'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '成功返回活动时间片' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "mapNaturePoiToActivity", null);
__decorate([
    (0, common_1.Post)('nature-poi/generate-nara-hints'),
    (0, swagger_1.ApiOperation)({
        summary: '为自然 POI 生成 NARA 提示信息',
        description: '为自然 POI 生成 LLM 提示信息，包括叙事种子、行动提示、反思提示和锚点提示。\n\n' +
            '这些提示信息可以用于：\n' +
            '- 生成行程描述\n' +
            '- 创建叙事性内容\n' +
            '- 提供深度体验建议',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                poi: {
                    type: 'object',
                    description: '自然 POI 对象',
                },
            },
            required: ['poi'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 NARA 提示信息',
        schema: {
            type: 'object',
            properties: {
                narrativeSeed: { type: 'string' },
                actionHint: { type: 'string' },
                reflectionHint: { type: 'string' },
                anchorHint: { type: 'string' },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "generateNaraHint", null);
__decorate([
    (0, common_1.Post)('nature-poi/batch-map-to-activities'),
    (0, swagger_1.ApiOperation)({
        summary: '批量将自然 POI 映射为活动时间片',
        description: '批量将多个自然 POI 转换为活动时间片，用于行程生成',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                pois: {
                    type: 'array',
                    items: { type: 'object' },
                    description: '自然 POI 对象数组',
                },
                options: {
                    type: 'object',
                    properties: {
                        time: { type: 'string', example: '09:30' },
                        template: { type: 'string', enum: ['photoStop', 'shortWalk', 'halfDayHike'] },
                        language: { type: 'string', enum: ['zh-CN', 'en'] },
                    },
                },
            },
            required: ['pois'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回活动时间片数组',
        schema: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    time: { type: 'string' },
                    title: { type: 'string' },
                    activity: { type: 'string' },
                    type: { type: 'string' },
                    durationMinutes: { type: 'number' },
                    coordinates: { type: 'object' },
                    notes: { type: 'string' },
                    details: { type: 'object' },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "batchMapNaturePoisToActivities", null);
__decorate([
    (0, common_1.Post)('batch'),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 批量获取地点详情',
        description: '⚠️ 已废弃，请使用 POST /places/admin/batch。根据地点 ID 列表批量获取地点详情，避免前端 N 次请求。',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                ids: {
                    type: 'array',
                    items: { type: 'number' },
                    description: '地点 ID 列表',
                    example: [1, 2, 3],
                },
            },
            required: ['ids'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点详情列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getPlacesBatch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('search/semantic'),
    (0, swagger_1.ApiOperation)({
        summary: '语义地点搜索',
        description: '使用向量搜索理解自然语言查询，找到语义相关但不含关键词的地点。\n\n' +
            '**功能特点：**\n' +
            '- 支持自然语言查询（如"冰岛的瀑布"、"适合拍照的景点"）\n' +
            '- 混合搜索：向量搜索（语义） + 关键词搜索（精确匹配）\n' +
            '- 显示推荐原因\n' +
            '- 支持按国家、类别筛选和距离排序',
    }),
    (0, swagger_1.ApiQuery)({ name: 'q', description: '自然语言查询', example: '瀑布', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码（IS=冰岛，JP=日本，CN=中国）', example: 'IS', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 64.1466, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度（可选，用于距离排序）', example: -21.9426, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'radius', description: '搜索半径（米，可选）', example: 5000, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({
        name: 'type',
        description: '地点类型（可选）',
        enum: client_1.PlaceCategory,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制（默认 20）', example: 20, type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回语义搜索结果',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('countryCode')),
    __param(2, (0, common_1.Query)('lat')),
    __param(3, (0, common_1.Query)('lng')),
    __param(4, (0, common_1.Query)('radius')),
    __param(5, (0, common_1.Query)('type')),
    __param(6, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "semanticSearch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('search/batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量自然语言搜索POI',
        description: '支持多个自然语言查询的批量搜索，并行处理所有查询。\n\n' +
            '**功能特点：**\n' +
            '- 支持多个自然语言查询（如["像京都那样的地方", "适合拍照的景点", "安静的咖啡厅"]）\n' +
            '- 并行处理，提高效率\n' +
            '- 每个查询都会调用 embedding API（OpenAI 或 HuggingFace）进行语义理解\n' +
            '- 混合搜索：向量搜索（语义） + 关键词搜索（精确匹配）\n' +
            '- 返回每个查询对应的结果列表\n\n' +
            '**注意：**批量搜索会为每个查询调用一次 embedding API，请注意 API 配额限制。',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                queries: {
                    type: 'array',
                    items: { type: 'string' },
                    description: '自然语言查询数组',
                    example: ['像京都那样的地方', '适合拍照的景点', '安静的咖啡厅'],
                    minItems: 1,
                    maxItems: 20,
                },
                lat: {
                    type: 'number',
                    description: '纬度（可选，用于距离排序）',
                    example: 35.6762,
                },
                lng: {
                    type: 'number',
                    description: '经度（可选，用于距离排序）',
                    example: 139.6503,
                },
                radius: {
                    type: 'number',
                    description: '搜索半径（米，可选）',
                    example: 5000,
                },
                type: {
                    type: 'string',
                    enum: Object.values(client_1.PlaceCategory),
                    description: '地点类型（可选）',
                },
                limit: {
                    type: 'number',
                    description: '每个查询返回数量限制（默认 20）',
                    example: 20,
                    default: 20,
                    minimum: 1,
                    maximum: 100,
                },
            },
            required: ['queries'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回批量搜索结果',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'array',
                    items: {
                        type: 'object',
                        properties: {
                            query: { type: 'string', example: '像京都那样的地方' },
                            results: {
                                type: 'array',
                                items: {
                                    type: 'object',
                                    properties: {
                                        id: { type: 'number', example: 123 },
                                        nameCN: { type: 'string', example: '清水寺' },
                                        nameEN: { type: 'string', example: 'Kiyomizu-dera' },
                                        address: { type: 'string', example: '京都府京都市' },
                                        category: { type: 'string', example: 'ATTRACTION' },
                                        matchReasons: {
                                            type: 'array',
                                            items: { type: 'string' },
                                            example: ['根据评论提到的\'静谧\'和\'日式庭院\'推荐'],
                                        },
                                        vectorScore: { type: 'number', example: 0.85 },
                                        keywordScore: { type: 'number', example: 0.3 },
                                        finalScore: { type: 'number', example: 0.75 },
                                        distance: { type: 'number', example: 1200 },
                                    },
                                },
                            },
                            total: { type: 'number', example: 15 },
                            error: { type: 'string' },
                        },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "batchSemanticSearch", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('search'),
    (0, swagger_1.ApiOperation)({
        summary: '关键词搜索地点',
        description: '根据关键词搜索地点，支持中英文名称、地址搜索。支持按类别筛选、国家过滤和距离排序。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'q', description: '搜索关键词', example: '瀑布', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码（IS=冰岛，JP=日本，CN=中国）', example: 'IS', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 64.1466, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度（可选，用于距离排序）', example: -21.9426, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'radius', description: '搜索半径（米，可选）', example: 5000, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({
        name: 'type',
        description: '地点类型（可选）',
        enum: client_1.PlaceCategory,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制（默认 20）', example: 20, type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('countryCode')),
    __param(2, (0, common_1.Query)('lat')),
    __param(3, (0, common_1.Query)('lng')),
    __param(4, (0, common_1.Query)('radius')),
    __param(5, (0, common_1.Query)('type')),
    __param(6, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "searchPlaces", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('list'),
    (0, swagger_1.ApiOperation)({
        summary: '获取地点列表（支持分页和上下切换）',
        description: '获取地点列表，支持分页、按类别和城市筛选，支持上下切换。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', description: '页码（从 1 开始）', example: 1, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '每页数量（默认 20，最大 100）', example: 20, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({
        name: 'category',
        description: '地点类型筛选',
        enum: client_1.PlaceCategory,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({ name: 'cityId', description: '城市ID筛选', example: 1, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({
        name: 'orderBy',
        description: '排序字段',
        enum: ['id', 'rating', 'createdAt', 'updatedAt'],
        example: 'id',
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'orderDirection',
        description: '排序方向',
        enum: ['asc', 'desc'],
        example: 'desc',
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点列表（包含分页信息）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [place_list_query_dto_1.PlaceListQueryDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getPlacesList", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('autocomplete'),
    (0, swagger_1.ApiOperation)({
        summary: '地点名称自动补全',
        description: '根据输入关键词返回地点名称建议，用于搜索框下拉建议。支持按国家过滤。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'q', description: '搜索关键词', example: '瀑布', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码（IS=冰岛，JP=日本，CN=中国）', example: 'IS', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度（可选，用于距离排序）', example: 64.1466, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度（可选，用于距离排序）', example: -21.9426, type: Number, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制（默认 10）', example: 10, type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点名称建议列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('q')),
    __param(1, (0, common_1.Query)('countryCode')),
    __param(2, (0, common_1.Query)('lat')),
    __param(3, (0, common_1.Query)('lng')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "autocompletePlaces", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('recommendations/activities'),
    (0, swagger_1.ApiOperation)({
        summary: '推荐活动 - 获取指定国家评分4.0以上的地点',
        description: '根据国家代码推荐评分4.0以上的地点，支持按类别筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', description: '国家代码（ISO 3166-1 alpha-2，如 IS=冰岛，JP=日本，CN=中国）', example: 'IS', type: String, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'category', description: '地点类别筛选', enum: client_1.PlaceCategory, example: 'ATTRACTION', required: false }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制（默认 20，最大 100）', example: 20, type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '推荐成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('countryCode')),
    __param(1, (0, common_1.Query)('category')),
    __param(2, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getRecommendedActivities", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('recommendations'),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 获取地点推荐（功能未实现）',
        description: '⚠️ 已废弃。功能未实现，请使用 GET /places/search/semantic 进行语义搜索。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', description: '行程 ID', example: '928b30d5-432b-4dbf-8967-2248222438be', required: true }),
    (0, swagger_1.ApiQuery)({ name: 'limit', description: '返回数量限制（默认 20）', example: 20, type: Number, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '功能未实现（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('tripId')),
    __param(1, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getRecommendations", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin'),
    (0, swagger_1.ApiOperation)({
        summary: '获取地点列表（管理接口）',
        description: '获取地点列表，支持分页、搜索、按类别和城市筛选。已优化查询性能，支持并行查询。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number, description: '页码', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number, description: '每页数量（最大100）', example: 20 }),
    (0, swagger_1.ApiQuery)({ name: 'search', required: false, type: String, description: '搜索关键词（名称、地址）' }),
    (0, swagger_1.ApiQuery)({
        name: 'category',
        required: false,
        enum: client_1.PlaceCategory,
        description: '地点类别',
        example: 'ATTRACTION'
    }),
    (0, swagger_1.ApiQuery)({ name: 'cityId', required: false, type: Number, description: '城市ID', example: 1 }),
    (0, swagger_1.ApiQuery)({ name: 'countryCode', required: false, type: String, description: '国家代码（ISO 3166-1 alpha-2）', example: 'JP' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [admin_place_dto_1.GetPlacesAdminQueryDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getPlacesAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取地点详情（管理接口）',
        description: '根据地点ID获取地点详细信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '地点ID', type: Number, example: 1 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '地点不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getPlaceAdminById", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Put)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '更新地点（管理接口）',
        description: '更新地点信息，包括名称、地址、坐标、元数据等。无需认证。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '地点ID', type: Number, example: 1 }),
    (0, swagger_1.ApiBody)({ type: update_place_dto_1.UpdatePlaceDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新地点',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '地点不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_place_dto_1.UpdatePlaceDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "updatePlaceAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Delete)('admin/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '删除地点（管理接口）',
        description: '删除地点记录。注意：如果地点已被行程使用，删除可能会影响相关行程。无需认证。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '地点ID', type: Number, example: 1 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除地点',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '地点不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '地点正在使用中，无法删除',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "deletePlaceAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('admin/batch'),
    (0, swagger_1.ApiOperation)({
        summary: '批量获取POI详情（管理接口）',
        description: '根据POI ID数组批量获取POI详情，用于在日计划中显示已选POI的完整信息。避免多次单独查询POI详情。',
    }),
    (0, swagger_1.ApiBody)({ type: batch_place_dto_1.BatchPlaceRequestDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回POI详情列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '输入数据验证失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [batch_place_dto_1.BatchPlaceRequestDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getPlacesBatchAdmin", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取地点详情',
        description: '根据地点 ID 获取完整的地点信息，包括元数据、物理元数据、营业状态等。用于时间轴、地点详情页、加入行程前的确认弹窗。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '地点 ID', type: Number, example: 1 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回地点详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '地点不存在' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getPlaceById", null);
__decorate([
    (0, common_1.Put)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 更新地点',
        description: '⚠️ 已废弃，请使用 PUT /places/admin/:id。更新地点信息，包括名称、地址、坐标、元数据等。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '地点 ID', type: Number, example: 1 }),
    (0, swagger_1.ApiBody)({ type: update_place_dto_1.UpdatePlaceDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功更新地点',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '地点不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '输入数据验证失败' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number, update_place_dto_1.UpdatePlaceDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "updatePlace", null);
__decorate([
    (0, common_1.Delete)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '[Deprecated] 删除地点',
        description: '⚠️ 已废弃，请使用 DELETE /places/admin/:id。删除地点记录。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '地点 ID', type: Number, example: 1 }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功删除地点',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '地点不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '地点正在使用中，无法删除' }),
    __param(0, (0, common_1.Param)('id', common_1.ParseIntPipe)),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Number]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "deletePlace", null);
__decorate([
    (0, common_1.Post)('metrics/difficulty'),
    (0, swagger_1.ApiOperation)({
        summary: '计算路线难度',
        description: '计算两点间路线的难度等级，包括距离、爬升、坡度等指标。\n\n' +
            '**功能流程**：\n' +
            '1. 从 Google Maps 或 Mapbox 获取路线\n' +
            '2. 对路线进行等距重采样\n' +
            '3. 获取高程数据（Google Elevation API 或 Mapbox Terrain-RGB）\n' +
            '4. 计算距离、累计爬升、平均坡度\n' +
            '5. 评估难度等级（EASY/MODERATE/HARD/EXTREME）\n' +
            '6. 可选返回 GeoJSON 格式的路线数据\n\n' +
            '**难度评估规则**：\n' +
            '- 优先级1：trailDifficulty（官方评级，直接使用）\n' +
            '- 优先级2：基于距离和爬升计算（S_km = D + E/100）\n' +
            '- 高海拔修正（分段线性插值）：\n' +
            '  * 1500m: ×1.00, 2500m: ×1.05, 3000m: ×1.10, 3500m: ×1.20\n' +
            '  * 4000m: ×1.30, 4500m: ×1.45, 5000m: ×1.60, 5500m: ×1.80\n' +
            '  * 6000m: ×2.10, 7000m: ×2.50\n' +
            '- 可选修正项（可叠加，总系数上限3.0）：\n' +
            '  * 缺乏适应惩罚（未在高海拔过夜或最近3天平均睡眠海拔<2500m）：×1.10\n' +
            '  * 超长暴露时间（行程>8h）：×1.05\n' +
            '  * 极寒/风寒（体感温度<-10℃且时间>3h）：×1.05\n' +
            '  * 高背负（>12kg）：×1.05\n' +
            '- 高纬度（|纬度|≥60°）修正：×1.2\n' +
            '- 陡坡（≥15%）修正：上调一档\n' +
            '- accessType为VEHICLE/CABLE_CAR：至少EASY\n' +
            '- subCategory为glacier/volcano：至少MODERATE',
    }),
    (0, swagger_1.ApiBody)({
        type: route_difficulty_dto_1.RouteDifficultyRequestDto,
        description: '路线难度计算请求参数',
        examples: {
            google: {
                summary: 'Google示例',
                value: {
                    provider: 'google',
                    origin: '39.9042,116.4074',
                    destination: '39.914,116.403',
                    profile: 'walking',
                    sampleM: 30,
                    category: 'ATTRACTION',
                    accessType: 'HIKING',
                    elevationMeters: 2300,
                    includeGeoJson: false,
                },
            },
            mapbox: {
                summary: 'Mapbox示例',
                value: {
                    provider: 'mapbox',
                    origin: '7.9904,46.5763',
                    destination: '7.985,46.577',
                    profile: 'walking',
                    sampleM: 30,
                    category: 'ATTRACTION',
                    visitDuration: '半天',
                    z: 14,
                    workers: 8,
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回路线难度评估结果',
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数无效' }),
    (0, swagger_1.ApiResponse)({ status: 503, description: '服务不可用（API密钥未配置或外部API错误）' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [route_difficulty_dto_1.RouteDifficultyRequestDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "calculateRouteDifficulty", null);
__decorate([
    (0, common_1.Post)('images/batch'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '批量获取地点图片',
        description: `
批量从 Unsplash 获取地点的经典照片。

**使用说明**：
- 每个地点返回一张最相关的高质量照片
- 优先提供英文名称 (placeNameEn) 以提高匹配度
- 提供 country 和 category 可以更精准定位
- 结果会缓存 24 小时

**Unsplash 归属要求**：
- 使用图片时必须展示 attribution 信息
- 格式："Photo by {photographerName} on Unsplash"
- 链接到 photographerUrl 和 unsplashUrl

**限制**：
- 单次请求最多 20 个地点
- API 速率限制：50 次/小时
    `,
    }),
    (0, swagger_1.ApiBody)({
        type: place_image_dto_1.BatchPlaceImageRequestDto,
        examples: {
            japan_trip: {
                summary: '日本行程地点',
                value: {
                    places: [
                        { placeName: '富士山', placeNameEn: 'Mount Fuji', country: 'Japan', category: 'mountain' },
                        { placeName: '浅草寺', placeNameEn: 'Sensoji Temple', country: 'Japan', category: 'temple' },
                        { placeName: '东京塔', placeNameEn: 'Tokyo Tower', country: 'Japan', category: 'landmark' },
                        { placeName: '清水寺', placeNameEn: 'Kiyomizu-dera Temple', country: 'Japan', category: 'temple' },
                    ],
                },
            },
            europe_trip: {
                summary: '欧洲行程地点',
                value: {
                    places: [
                        { placeName: '埃菲尔铁塔', placeNameEn: 'Eiffel Tower', country: 'France', category: 'landmark' },
                        { placeName: '卢浮宫', placeNameEn: 'Louvre Museum', country: 'France', category: 'museum' },
                        { placeName: '巴塞罗那圣家堂', placeNameEn: 'Sagrada Familia', country: 'Spain', category: 'landmark' },
                    ],
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回图片数据',
        type: place_image_dto_1.BatchPlaceImageResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数无效' }),
    (0, swagger_1.ApiResponse)({ status: 429, description: 'API 速率限制' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [place_image_dto_1.BatchPlaceImageRequestDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getBatchPlaceImages", null);
__decorate([
    (0, common_1.Get)('images/cache-stats'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '获取图片缓存统计',
        description: '查看当前图片缓存的状态',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '缓存统计信息',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "getImageCacheStats", null);
__decorate([
    (0, common_1.Post)('images/save'),
    (0, public_decorator_1.Public)(),
    (0, swagger_1.ApiOperation)({
        summary: '保存 Unsplash 图片到数据库',
        description: `
将 Unsplash 图片保存到指定地点的 metadata.images 中。

**使用场景**：
- 从批量图片接口获取图片后，需要持久化保存到数据库
- 图片会保存到 Place.metadata.images 数组中
- 格式与上传接口保持一致，便于统一管理

**图片格式**：
- url: 使用 regular 尺寸（1080px 宽）作为主 URL
- source: 'unsplash'
- caption: 使用图片的 description 或 altDescription
- attribution: 保存 Unsplash 归属信息（必须展示）

**主图设置**：
- 如果地点没有其他图片，自动设为主图
- 如果已有图片，默认不设为主图（可通过 isPrimary 参数控制）
    `,
    }),
    (0, swagger_1.ApiBody)({
        type: place_image_dto_1.SavePlaceImageRequestDto,
        examples: {
            save_image: {
                summary: '保存图片示例',
                value: {
                    placeId: 123,
                    photo: {
                        id: 'abc123',
                        width: 4000,
                        height: 3000,
                        color: '#4A90D9',
                        blurHash: 'LGF5]+Yk^6#M@-5c,1J5@[or[Q6.',
                        description: 'Beautiful mountain view',
                        altDescription: 'Mount Fuji at sunset',
                        urls: {
                            raw: 'https://images.unsplash.com/photo-xxx?raw',
                            full: 'https://images.unsplash.com/photo-xxx?full',
                            regular: 'https://images.unsplash.com/photo-xxx?w=1080',
                            small: 'https://images.unsplash.com/photo-xxx?w=400',
                            thumb: 'https://images.unsplash.com/photo-xxx?w=200',
                        },
                        user: {
                            name: 'John Doe',
                            username: 'johndoe',
                            link: 'https://unsplash.com/@johndoe',
                        },
                        attribution: {
                            photographerName: 'John Doe',
                            photographerUrl: 'https://unsplash.com/@johndoe',
                            unsplashUrl: 'https://unsplash.com/photos/abc123',
                        },
                    },
                    isPrimary: false,
                },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功保存图片',
        type: place_image_dto_1.SavePlaceImageResponseDto,
    }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '地点不存在' }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求参数无效' }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [place_image_dto_1.SavePlaceImageRequestDto]),
    __metadata("design:returntype", Promise)
], PlacesController.prototype, "savePlaceImage", null);
exports.PlacesController = PlacesController = PlacesController_1 = __decorate([
    (0, swagger_1.ApiTags)('places'),
    (0, common_1.Controller)('places'),
    __metadata("design:paramtypes", [places_service_1.PlacesService,
        hotel_recommendation_service_1.HotelRecommendationService,
        nature_poi_service_1.NaturePoiService,
        nature_poi_mapper_service_1.NaturePoiMapperService,
        nara_hint_service_1.NaraHintService,
        route_difficulty_service_1.RouteDifficultyService,
        unsplash_service_1.UnsplashService,
        prisma_service_1.PrismaService,
        upload_service_1.UploadService])
], PlacesController);
//# sourceMappingURL=places.controller.js.map