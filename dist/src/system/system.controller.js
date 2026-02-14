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
exports.SystemController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const system_service_1 = require("./system.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
let SystemController = class SystemController {
    constructor(systemService) {
        this.systemService = systemService;
    }
    getStatus() {
        const status = this.systemService.getStatus();
        return (0, standard_response_dto_1.successResponse)(status);
    }
    async getAdminMetrics() {
        try {
            const metrics = await this.systemService.getAdminMetrics();
            return (0, standard_response_dto_1.successResponse)(metrics);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminPerformance(startTime, endTime, granularity) {
        try {
            const performance = await this.systemService.getAdminPerformance({
                startTime: startTime ? new Date(startTime) : undefined,
                endTime: endTime ? new Date(endTime) : undefined,
                granularity: granularity,
            });
            return (0, standard_response_dto_1.successResponse)(performance);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminErrors(startTime, endTime, level) {
        try {
            const errors = await this.systemService.getAdminErrors({
                startTime: startTime ? new Date(startTime) : undefined,
                endTime: endTime ? new Date(endTime) : undefined,
                level: level,
            });
            return (0, standard_response_dto_1.successResponse)(errors);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminRequests(startTime, endTime, granularity) {
        try {
            const requests = await this.systemService.getAdminRequests({
                startTime: startTime ? new Date(startTime) : undefined,
                endTime: endTime ? new Date(endTime) : undefined,
                granularity: granularity,
            });
            return (0, standard_response_dto_1.successResponse)(requests);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminDatabase() {
        try {
            const database = await this.systemService.getAdminDatabase();
            return (0, standard_response_dto_1.successResponse)(database);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAdminCache() {
        try {
            const cache = await this.systemService.getAdminCache();
            return (0, standard_response_dto_1.successResponse)(cache);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.SystemController = SystemController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('status'),
    (0, swagger_1.ApiOperation)({
        summary: '获取系统能力/状态',
        description: '返回系统各功能模块的状态信息，用于前端提示"某能力暂不可用"。\n\n' +
            '**返回内容**：\n' +
            '- OCR Provider 状态（mock/google/unavailable）\n' +
            '- POI Provider 状态（mock/google/osm/unavailable）\n' +
            '- ASR Provider 状态（mock/openai/google/azure/unavailable）\n' +
            '- TTS Provider 状态（mock/openai/google/azure/unavailable）\n' +
            '- LLM Provider 状态（mock/openai/anthropic/google/unavailable）\n' +
            '- 限流信息\n' +
            '- 功能开关状态',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回系统状态',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", void 0)
], SystemController.prototype, "getStatus", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/metrics'),
    (0, swagger_1.ApiOperation)({
        summary: '获取系统指标（管理接口）',
        description: '获取系统整体指标统计，包括系统资源、API性能、数据库、缓存等。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回系统指标（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SystemController.prototype, "getAdminMetrics", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/performance'),
    (0, swagger_1.ApiOperation)({
        summary: '获取性能指标（管理接口）',
        description: '获取详细的性能指标，支持时间范围筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'granularity', required: false, enum: ['hour', 'day'], description: '时间粒度' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回性能指标（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('startTime')),
    __param(1, (0, common_1.Query)('endTime')),
    __param(2, (0, common_1.Query)('granularity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], SystemController.prototype, "getAdminPerformance", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/errors'),
    (0, swagger_1.ApiOperation)({
        summary: '获取错误日志统计（管理接口）',
        description: '获取错误日志统计信息，包括错误分类、趋势分析等。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'level', required: false, enum: ['error', 'warn'], description: '错误级别' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回错误统计（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('startTime')),
    __param(1, (0, common_1.Query)('endTime')),
    __param(2, (0, common_1.Query)('level')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], SystemController.prototype, "getAdminErrors", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/requests'),
    (0, swagger_1.ApiOperation)({
        summary: '获取请求统计（管理接口）',
        description: '获取API请求统计信息，包括请求量、端点统计、方法统计等。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startTime', required: false, description: '开始时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'endTime', required: false, description: '结束时间（ISO 8601）' }),
    (0, swagger_1.ApiQuery)({ name: 'granularity', required: false, enum: ['hour', 'day'], description: '时间粒度' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回请求统计（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)('startTime')),
    __param(1, (0, common_1.Query)('endTime')),
    __param(2, (0, common_1.Query)('granularity')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, String, String]),
    __metadata("design:returntype", Promise)
], SystemController.prototype, "getAdminRequests", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/database'),
    (0, swagger_1.ApiOperation)({
        summary: '获取数据库状态（管理接口）',
        description: '获取数据库连接池状态、查询统计、表信息等。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回数据库状态（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SystemController.prototype, "getAdminDatabase", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('admin/cache'),
    (0, swagger_1.ApiOperation)({
        summary: '获取缓存状态（管理接口）',
        description: '获取缓存系统状态，包括命中率、内存使用、操作统计等。',
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回缓存状态（统一响应格式）',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], SystemController.prototype, "getAdminCache", null);
exports.SystemController = SystemController = __decorate([
    (0, swagger_1.ApiTags)('system'),
    (0, common_1.Controller)('system'),
    __metadata("design:paramtypes", [system_service_1.SystemService])
], SystemController);
//# sourceMappingURL=system.controller.js.map