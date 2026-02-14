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
exports.HotelsController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const hotel_price_service_1 = require("./services/hotel-price.service");
const hotel_price_prediction_service_1 = require("./services/hotel-price-prediction.service");
const predict_price_dto_1 = require("./dto/predict-price.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
let HotelsController = class HotelsController {
    constructor(hotelPriceService, hotelPricePredictionService) {
        this.hotelPriceService = hotelPriceService;
        this.hotelPricePredictionService = hotelPricePredictionService;
    }
    async estimatePrice(city, starRating, year, quarter, includeRecommendations, recommendationLimit) {
        if (starRating < 1 || starRating > 5) {
            throw new common_1.BadRequestException('星级必须在 1-5 之间');
        }
        const yearNum = year ? parseInt(year) : undefined;
        const quarterNum = quarter ? parseInt(quarter) : undefined;
        const includeRecs = includeRecommendations === 'true';
        const recLimit = recommendationLimit ? parseInt(recommendationLimit) : 5;
        if (quarterNum !== undefined && (quarterNum < 1 || quarterNum > 4)) {
            throw new common_1.BadRequestException('季度必须在 1-4 之间');
        }
        if (quarterNum !== undefined && yearNum === undefined) {
            throw new common_1.BadRequestException('指定季度时必须同时指定年份');
        }
        try {
            let result;
            if (includeRecs) {
                result = await this.hotelPriceService.estimatePriceWithRecommendations(city, starRating, yearNum, quarterNum, true, recLimit);
            }
            else {
                result = await this.hotelPriceService.estimatePrice(city, starRating, yearNum, quarterNum);
            }
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async getCityStarOptions(city) {
        const options = await this.hotelPriceService.getCityStarOptions(city);
        return (0, standard_response_dto_1.successResponse)(options);
    }
    async getQuarterlyTrend(city, starRating) {
        try {
            const starRatingNum = starRating ? parseInt(starRating) : undefined;
            if (starRatingNum !== undefined && (starRatingNum < 1 || starRatingNum > 5)) {
                throw new common_1.BadRequestException('星级必须在 1-5 之间');
            }
            const trend = await this.hotelPriceService.getQuarterlyTrend(city, starRatingNum);
            return (0, standard_response_dto_1.successResponse)(trend);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async getRecommendations(city, starRating, minPrice, maxPrice, limit) {
        try {
            if (starRating < 1 || starRating > 5) {
                throw new common_1.BadRequestException('星级必须在 1-5 之间');
            }
            const minPriceNum = minPrice ? parseFloat(minPrice) : undefined;
            const maxPriceNum = maxPrice ? parseFloat(maxPrice) : undefined;
            const limitNum = limit ? parseInt(limit) : 10;
            const recommendations = await this.hotelPriceService.recommendHotels(city, starRating, minPriceNum, maxPriceNum, limitNum);
            return (0, standard_response_dto_1.successResponse)(recommendations);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            throw error;
        }
    }
    async predictPrice(dto) {
        try {
            if (dto.star_level < 1 || dto.star_level > 5) {
                throw new common_1.BadRequestException('星级必须在 1-5 之间');
            }
            const result = await this.hotelPricePredictionService.predictHotelPrice({
                city: dto.city,
                star_level: dto.star_level,
                check_in_date: dto.check_in_date,
                check_out_date: dto.check_out_date,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            if (error instanceof common_1.BadRequestException) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.VALIDATION_ERROR, error.message);
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.HotelsController = HotelsController;
__decorate([
    (0, common_1.Get)('price/estimate'),
    (0, swagger_1.ApiOperation)({
        summary: '估算酒店价格',
        description: '根据城市、星级、年份和季度估算酒店价格。\n\n' +
            '**估算公式：**\n' +
            '价格 = 基础价格 × 城市-星级因子\n\n' +
            '如果提供了年份和季度，会优先使用该季度的实际价格数据。\n\n' +
            '**推荐酒店：**\n' +
            '设置 `includeRecommendations=true` 可以在返回价格估算的同时返回推荐的酒店列表。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'city',
        description: '城市名称',
        example: '洛阳市',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'starRating',
        description: '星级（1-5）',
        example: 4,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'year',
        description: '年份（可选，用于季度估算）',
        example: 2024,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'quarter',
        description: '季度（1-4，可选，需要配合year使用）',
        example: 1,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'includeRecommendations',
        description: '是否包含推荐酒店（默认 false）',
        example: true,
        type: Boolean,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'recommendationLimit',
        description: '推荐酒店数量（默认 5，仅在 includeRecommendations=true 时有效）',
        example: 5,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回估算价格（可选包含推荐酒店，统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('city')),
    __param(1, (0, common_1.Query)('starRating', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('year')),
    __param(3, (0, common_1.Query)('quarter')),
    __param(4, (0, common_1.Query)('includeRecommendations')),
    __param(5, (0, common_1.Query)('recommendationLimit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, String, String, String]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "estimatePrice", null);
__decorate([
    (0, common_1.Get)('price/city-options'),
    (0, swagger_1.ApiOperation)({
        summary: '获取城市的所有星级价格选项',
        description: '返回指定城市所有星级的价格选项，用于展示不同星级的价格对比。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'city',
        description: '城市名称',
        example: '洛阳市',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回星级价格选项（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('city')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "getCityStarOptions", null);
__decorate([
    (0, common_1.Get)('price/quarterly-trend'),
    (0, swagger_1.ApiOperation)({
        summary: '获取季度价格趋势',
        description: '返回指定城市（和星级）的季度价格趋势数据，用于展示价格走势图。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'city',
        description: '城市名称',
        example: '洛阳市',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'starRating',
        description: '星级（可选，不指定则返回该城市所有星级的数据）',
        example: 4,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回季度价格趋势（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('city')),
    __param(1, (0, common_1.Query)('starRating')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "getQuarterlyTrend", null);
__decorate([
    (0, common_1.Get)('recommendations'),
    (0, swagger_1.ApiOperation)({
        summary: '推荐酒店',
        description: '根据城市、星级和价格范围推荐酒店。\n\n' +
            '从酒店数据库中筛选符合条件的酒店，并根据品牌推断星级。',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'city',
        description: '城市名称',
        example: '洛阳市',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'starRating',
        description: '星级（1-5）',
        example: 4,
        type: Number,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'minPrice',
        description: '最低价格（可选）',
        example: 300,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'maxPrice',
        description: '最高价格（可选）',
        example: 600,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiQuery)({
        name: 'limit',
        description: '返回数量限制（默认 10）',
        example: 10,
        type: Number,
        required: false,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回推荐酒店列表（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Query)('city')),
    __param(1, (0, common_1.Query)('starRating', common_1.ParseIntPipe)),
    __param(2, (0, common_1.Query)('minPrice')),
    __param(3, (0, common_1.Query)('maxPrice')),
    __param(4, (0, common_1.Query)('limit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Number, String, String, String]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "getRecommendations", null);
__decorate([
    (0, common_1.Post)('price/predict'),
    (0, swagger_1.ApiOperation)({
        summary: '预测酒店价格趋势',
        description: '使用 Prophet 模型（或历史同期均值法）预测未来30天的酒店价格趋势，并提供买入信号。\n\n' +
            '**功能：**\n' +
            '- 显示价格趋势红绿灯（BUY/WAIT/NEUTRAL）\n' +
            '- 预测未来30天的价格走势（含置信区间）\n' +
            '- 提供历史价格统计（均值、最低、最高）\n' +
            '- 自然语言建议（如"当前价格处于低位，建议立即预订"）',
    }),
    (0, swagger_1.ApiBody)({ type: predict_price_dto_1.HotelPricePredictionDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回价格预测（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '输入数据验证失败（统一响应格式）',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [predict_price_dto_1.HotelPricePredictionDto]),
    __metadata("design:returntype", Promise)
], HotelsController.prototype, "predictPrice", null);
exports.HotelsController = HotelsController = __decorate([
    (0, swagger_1.ApiTags)('hotels'),
    (0, common_1.Controller)('hotels'),
    __metadata("design:paramtypes", [hotel_price_service_1.HotelPriceService,
        hotel_price_prediction_service_1.HotelPricePredictionService])
], HotelsController);
//# sourceMappingURL=hotels.controller.js.map