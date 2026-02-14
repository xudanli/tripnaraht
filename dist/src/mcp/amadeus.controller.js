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
var AmadeusController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AmadeusController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const amadeus_service_1 = require("./amadeus.service");
const amadeus_search_dto_1 = require("./dto/amadeus-search.dto");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let AmadeusController = AmadeusController_1 = class AmadeusController {
    constructor(amadeusService) {
        this.amadeusService = amadeusService;
        this.logger = new common_1.Logger(AmadeusController_1.name);
    }
    async searchFlights(dto) {
        var _a;
        try {
            this.logger.log(`Searching flights: ${dto.originLocationCode} -> ${dto.destinationLocationCode}`);
            const result = await this.amadeusService.searchFlightOffers({
                originLocationCode: dto.originLocationCode,
                destinationLocationCode: dto.destinationLocationCode,
                departureDate: dto.departureDate,
                adults: dto.adults,
                returnDate: dto.returnDate,
                children: dto.children,
                infants: dto.infants,
                travelClass: dto.travelClass,
                includedAirlineCodes: dto.includedAirlineCodes,
                excludedAirlineCodes: dto.excludedAirlineCodes,
                nonStop: dto.nonStop,
                currencyCode: dto.currencyCode,
                maxPrice: dto.maxPrice,
                max: dto.max,
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
            this.logger.error('Search flights failed:', error);
            if ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('OAuth authorization required')) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.UNAUTHORIZED, '需要完成 OAuth 认证', {
                    message: error.message,
                    authorizationUrl: error.message.split('Visit: ')[1] || '',
                });
            }
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '搜索航班失败');
        }
    }
    async ping() {
        try {
            const result = await this.amadeusService.ping();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Ping failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || 'Ping 失败');
        }
    }
    async listTools() {
        try {
            const result = await this.amadeusService.listTools();
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('List tools failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '获取工具列表失败');
        }
    }
    async checkAuthStatus() {
        try {
            const status = await this.amadeusService.checkAuthStatus();
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
            const result = await this.amadeusService.getAuthorizationUrl();
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
            const result = await this.amadeusService.verifyAuthorization(connectionId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error('Verify authorization failed:', error);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message || '验证授权失败');
        }
    }
};
exports.AmadeusController = AmadeusController;
__decorate([
    (0, common_1.Post)('search/flights'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '搜索航班',
        description: '使用 Amadeus API 搜索航班，支持单程和往返航班',
    }),
    (0, swagger_1.ApiBody)({ type: amadeus_search_dto_1.AmadeusSearchFlightOffersDto }),
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
    __metadata("design:paramtypes", [amadeus_search_dto_1.AmadeusSearchFlightOffersDto]),
    __metadata("design:returntype", Promise)
], AmadeusController.prototype, "searchFlights", null);
__decorate([
    (0, common_1.Get)('ping'),
    (0, swagger_1.ApiOperation)({
        summary: 'Ping 测试',
        description: '测试 Amadeus MCP 服务器连接',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '测试成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AmadeusController.prototype, "ping", null);
__decorate([
    (0, common_1.Get)('tools'),
    (0, swagger_1.ApiOperation)({
        summary: '列出所有可用工具',
        description: '获取 Amadeus MCP 服务器提供的所有工具列表',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AmadeusController.prototype, "listTools", null);
__decorate([
    (0, common_1.Get)('auth/status'),
    (0, swagger_1.ApiOperation)({
        summary: '检查授权状态',
        description: '检查当前是否已完成 Amadeus OAuth 授权',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '获取成功',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], AmadeusController.prototype, "checkAuthStatus", null);
__decorate([
    (0, common_1.Get)('auth/url'),
    (0, swagger_1.ApiOperation)({
        summary: '获取授权 URL',
        description: '获取 Amadeus OAuth 授权 URL，用户需要访问此 URL 完成授权',
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
], AmadeusController.prototype, "getAuthorizationUrl", null);
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
                    example: 'example-connection-id',
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
], AmadeusController.prototype, "verifyAuthorization", null);
exports.AmadeusController = AmadeusController = AmadeusController_1 = __decorate([
    (0, swagger_1.ApiTags)('amadeus'),
    (0, common_1.Controller)('amadeus'),
    (0, public_decorator_1.Public)(),
    __metadata("design:paramtypes", [amadeus_service_1.AmadeusService])
], AmadeusController);
//# sourceMappingURL=amadeus.controller.js.map