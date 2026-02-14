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
Object.defineProperty(exports, "__esModule", { value: true });
exports.WeatherController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const data_source_router_service_1 = require("../data-contracts/services/data-source-router.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const hybrid_cache_service_1 = require("../rag/services/hybrid-cache.service");
let WeatherController = class WeatherController {
    constructor(dataSourceRouter, cacheService) {
        this.dataSourceRouter = dataSourceRouter;
        this.cacheService = cacheService;
    }
    async getCurrentWeather(lat, lng, includeWindDetails, includeAuroraInfo) {
        const latNum = parseFloat(lat);
        const lngNum = parseFloat(lng);
        if (isNaN(latNum) || isNaN(lngNum)) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经纬度必须是有效数字');
        }
        if (latNum < -90 || latNum > 90) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '纬度必须在 -90 到 90 之间');
        }
        if (lngNum < -180 || lngNum > 180) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, '经度必须在 -180 到 180 之间');
        }
        try {
            const cacheKey = `weather:${latNum.toFixed(4)},${lngNum.toFixed(4)}:wind=${includeWindDetails === 'true'}:aurora=${includeAuroraInfo === 'true'}`;
            if (this.cacheService) {
                const cached = await this.cacheService.get(cacheKey);
                if (cached) {
                    return (0, standard_response_dto_1.successResponse)({
                        ...cached,
                        metadata: {
                            ...cached.metadata,
                            cached: true,
                        },
                    });
                }
            }
            const query = {
                lat: latNum,
                lng: lngNum,
                includeWindDetails: includeWindDetails === 'true',
                includeAuroraInfo: includeAuroraInfo === 'true',
            };
            const weatherData = await this.dataSourceRouter.getWeather(query);
            if (this.cacheService) {
                await this.cacheService.set(cacheKey, weatherData, 1800).catch(err => {
                    console.warn(`天气数据缓存失败: ${err.message}`);
                });
            }
            return (0, standard_response_dto_1.successResponse)(weatherData);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, `获取天气数据失败: ${error.message}`);
        }
    }
};
exports.WeatherController = WeatherController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('current'),
    (0, swagger_1.ApiOperation)({
        summary: '获取当前天气',
        description: '根据经纬度获取当前天气数据。系统会自动选择合适的数据源适配器（冰岛使用 apis.is，其他国家使用 WeatherAPI.com 或 OpenWeather）。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'lat', description: '纬度', example: 64.1466, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'lng', description: '经度', example: -21.9426, type: Number, required: true }),
    (0, swagger_1.ApiQuery)({ name: 'includeWindDetails', description: '是否包含详细风速信息（冰岛特定）', example: false, type: Boolean, required: false }),
    (0, swagger_1.ApiQuery)({ name: 'includeAuroraInfo', description: '是否包含极光信息（冰岛特定）', example: false, type: Boolean, required: false }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回天气数据',
        schema: {
            type: 'object',
            properties: {
                success: { type: 'boolean', example: true },
                data: {
                    type: 'object',
                    properties: {
                        temperature: { type: 'number', example: 5.6 },
                        feelsLikeTemperature: { type: 'number', example: 3.2, description: '体感温度（摄氏度，可选）' },
                        condition: { type: 'string', example: 'cloudy' },
                        windSpeed: { type: 'number', example: 8 },
                        windDirection: { type: 'number', example: 22.5 },
                        humidity: { type: 'number', example: 58 },
                        visibility: { type: 'number', example: 10000 },
                        alerts: { type: 'array' },
                        lastUpdated: { type: 'string', example: '2026-01-28T12:00:00Z' },
                        source: { type: 'string', example: 'apis.is' },
                        metadata: { type: 'object' },
                    },
                },
            },
        },
    }),
    __param(0, (0, common_1.Query)('lat')),
    __param(1, (0, common_1.Query)('lng')),
    __param(2, (0, common_1.Query)('includeWindDetails')),
    __param(3, (0, common_1.Query)('includeAuroraInfo')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, String]),
    __metadata("design:returntype", Promise)
], WeatherController.prototype, "getCurrentWeather", null);
exports.WeatherController = WeatherController = __decorate([
    (0, swagger_1.ApiTags)('Weather'),
    (0, common_1.Controller)('weather'),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [data_source_router_service_1.DataSourceRouterService,
        hybrid_cache_service_1.HybridCacheService])
], WeatherController);
//# sourceMappingURL=weather.controller.js.map