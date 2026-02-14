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
var AirbnbController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AirbnbController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const airbnb_service_1 = require("./airbnb.service");
const airbnb_monitoring_service_1 = require("./airbnb-monitoring.service");
const airbnb_search_dto_1 = require("./dto/airbnb-search.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let AirbnbController = AirbnbController_1 = class AirbnbController {
    constructor(airbnbService, monitoring) {
        this.airbnbService = airbnbService;
        this.monitoring = monitoring;
        this.logger = new common_1.Logger(AirbnbController_1.name);
    }
    async search(dto) {
        var _a, _b;
        try {
            this.logger.log(`Searching listings for location: ${dto.location}`);
            const result = await this.airbnbService.searchListings({
                location: dto.location,
                adults: dto.adults,
                children: dto.children,
                infants: dto.infants,
                pets: dto.pets,
                checkin: dto.checkin,
                checkout: dto.checkout,
                page: dto.page,
                ignoreRobotsText: dto.ignoreRobotsText,
            });
            if (result && result.content && result.content[0]) {
                const content = result.content[0];
                if (content.type === 'text') {
                    try {
                        const data = JSON.parse(content.text);
                        if (data.error) {
                            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, data.error, { suggestion: data.suggestion, url: data.url });
                        }
                        return (0, standard_response_dto_1.successResponse)({
                            searchUrl: data.searchUrl,
                            results: data.searchResults || [],
                            total: ((_a = data.searchResults) === null || _a === void 0 ? void 0 : _a.length) || 0,
                        });
                    }
                    catch (parseError) {
                        return (0, standard_response_dto_1.successResponse)({ raw: content.text });
                    }
                }
            }
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Search failed:', error);
            if ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('OAuth authorization required')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要完成 OAuth 认证', {
                    message: error.message,
                    authorizationUrl: error.message.split('Visit: ')[1] || '',
                });
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '搜索失败');
        }
    }
    async getListingDetails(listingId, checkin, checkout, adults, children, infants, pets, ignoreRobotsText) {
        var _a;
        try {
            this.logger.log(`Getting details for listing: ${listingId}`);
            const result = await this.airbnbService.getListingDetails({
                listingId,
                checkin,
                checkout,
                adults: adults ? parseInt(adults.toString()) : undefined,
                children: children ? parseInt(children.toString()) : undefined,
                infants: infants ? parseInt(infants.toString()) : undefined,
                pets: pets ? parseInt(pets.toString()) : undefined,
                ignoreRobotsText,
            });
            if (result && result.content && result.content[0]) {
                const content = result.content[0];
                if (content.type === 'text') {
                    try {
                        const data = JSON.parse(content.text);
                        return (0, standard_response_dto_1.successResponse)(data);
                    }
                    catch (parseError) {
                        return (0, standard_response_dto_1.successResponse)({ raw: content.text });
                    }
                }
            }
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Get listing details failed:', error);
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('OAuth authorization required')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要完成 OAuth 认证', {
                    message: error.message,
                    authorizationUrl: error.message.split('Visit: ')[1] || '',
                });
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取房源详情失败');
        }
    }
    async listTools() {
        try {
            const result = await this.airbnbService.listTools();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('List tools failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取工具列表失败');
        }
    }
    async checkAuthStatus() {
        try {
            const status = await this.airbnbService.checkAuthStatus();
            return (0, standard_response_dto_1.successResponse)(status);
        }
        catch (error) {
            this.logger.error('Check auth status failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '检查授权状态失败');
        }
    }
    async getAuthorizationUrl() {
        var _a;
        try {
            const result = await this.airbnbService.getAuthorizationUrl();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Get authorization URL failed:', error);
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('Already authorized')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BAD_REQUEST, '已经完成授权，无需再次授权');
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取授权 URL 失败');
        }
    }
    async verifyAuthorization(connectionId) {
        try {
            if (!connectionId) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.BAD_REQUEST, 'connectionId 不能为空');
            }
            const result = await this.airbnbService.verifyAuthorization(connectionId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Verify authorization failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '验证授权失败');
        }
    }
    async getStats(days) {
        try {
            const daysNum = days ? parseInt(days, 10) : 7;
            const stats = await this.monitoring.getRecentStats(daysNum);
            const performance = await this.monitoring.getPerformanceMetrics(daysNum);
            const totalCost = await this.monitoring.getTotalCostEstimate(daysNum);
            return (0, standard_response_dto_1.successResponse)({
                dailyStats: stats,
                performance,
                totalCostEstimate: totalCost,
            });
        }
        catch (error) {
            this.logger.error('Get stats failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取统计失败');
        }
    }
    async checkCostLimit(dailyLimit) {
        try {
            const limit = dailyLimit ? parseFloat(dailyLimit) : 1;
            const checkResult = await this.monitoring.checkCostLimit(limit);
            return (0, standard_response_dto_1.successResponse)(checkResult);
        }
        catch (error) {
            this.logger.error('Check cost limit failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '检查成本限制失败');
        }
    }
};
exports.AirbnbController = AirbnbController;
__decorate([
    (0, common_1.Post)('search'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '搜索 Airbnb 房源',
        description: '根据位置、日期、人数等条件搜索 Airbnb 房源',
    }),
    (0, swagger_1.ApiBody)({ type: airbnb_search_dto_1.AirbnbSearchDto }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '搜索成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '请求参数错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 500,
        description: '服务器错误',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [airbnb_search_dto_1.AirbnbSearchDto]),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "search", null);
__decorate([
    (0, common_1.Get)('listing/:listingId'),
    (0, swagger_1.ApiOperation)({
        summary: '获取房源详情',
        description: '根据房源 ID 获取详细信息',
    }),
    (0, swagger_1.ApiParam)({
        name: 'listingId',
        description: '房源 ID',
        example: '1573970428683000922',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '房源不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('listingId')),
    __param(1, (0, common_1.Query)('checkin')),
    __param(2, (0, common_1.Query)('checkout')),
    __param(3, (0, common_1.Query)('adults')),
    __param(4, (0, common_1.Query)('children')),
    __param(5, (0, common_1.Query)('infants')),
    __param(6, (0, common_1.Query)('pets')),
    __param(7, (0, common_1.Query)('ignoreRobotsText')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String, Number, Number, Number, Number, Boolean]),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "getListingDetails", null);
__decorate([
    (0, common_1.Get)('tools'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有可用工具',
        description: '获取 Airbnb MCP 服务器提供的所有工具列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('auth/status'),
    (0, swagger_1.ApiOperation)({
        summary: '检查授权状态',
        description: '检查当前是否已完成 Airbnb OAuth 授权',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "checkAuthStatus", null);
__decorate([
    (0, common_1.Get)('auth/url'),
    (0, swagger_1.ApiOperation)({
        summary: '获取授权 URL',
        description: '获取 Airbnb OAuth 授权 URL，用户需要访问此 URL 完成授权',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 400,
        description: '已授权或获取失败',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "getAuthorizationUrl", null);
__decorate([
    (0, common_1.Post)('auth/verify'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '验证授权',
        description: '验证指定的 connectionId 是否已完成授权',
    }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                connectionId: {
                    type: 'string',
                    description: '连接 ID（从授权 URL 获取）',
                    example: 'meadowlark-bEDi',
                },
            },
            required: ['connectionId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '验证成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Body)('connectionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "verifyAuthorization", null);
__decorate([
    (0, common_1.Get)('monitoring/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Airbnb API 使用统计',
        description: '获取最近 N 天的 Airbnb API 调用统计、性能指标和成本估算',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'days',
        required: false,
        type: Number,
        description: '统计天数（默认 7 天）',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('days')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "getStats", null);
__decorate([
    (0, common_1.Get)('monitoring/cost-check'),
    (0, swagger_1.ApiOperation)({
        summary: '检查成本限制',
        description: '检查今日 Airbnb API 调用成本是否超过限制',
    }),
    (0, swagger_1.ApiQuery)({
        name: 'dailyLimit',
        required: false,
        type: Number,
        description: '每日成本限制（USD，默认 1）',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '检查成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('dailyLimit')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AirbnbController.prototype, "checkCostLimit", null);
exports.AirbnbController = AirbnbController = AirbnbController_1 = __decorate([
    (0, swagger_1.ApiTags)('airbnb'),
    (0, common_1.Controller)('airbnb'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [airbnb_service_1.AirbnbService,
        airbnb_monitoring_service_1.AirbnbMonitoringService])
], AirbnbController);
//# sourceMappingURL=airbnb.controller.js.map