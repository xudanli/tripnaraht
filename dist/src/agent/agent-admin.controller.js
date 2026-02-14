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
var AgentAdminController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentAdminController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const api_response_dto_1 = require("../common/dto/api-response.dto");
const agent_run_admin_service_1 = require("./services/agent-run-admin.service");
let AgentAdminController = AgentAdminController_1 = class AgentAdminController {
    constructor(agentRunAdminService) {
        this.agentRunAdminService = agentRunAdminService;
        this.logger = new common_1.Logger(AgentAdminController_1.name);
    }
    async getRunStats(query) {
        try {
            const stats = await this.agentRunAdminService.getRunStats({
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
                planningPhase: query.planningPhase,
            });
            return (0, standard_response_dto_1.successResponse)(stats);
        }
        catch (error) {
            this.logger.error(`获取运行统计失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getPerformance(query) {
        try {
            const performance = await this.agentRunAdminService.getPerformanceAnalysis({
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
            });
            return (0, standard_response_dto_1.successResponse)(performance);
        }
        catch (error) {
            this.logger.error(`获取性能分析失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getRuns(query) {
        try {
            const result = await this.agentRunAdminService.getRuns({
                tripId: query.tripId,
                userId: query.userId,
                status: query.status,
                planningPhase: query.planningPhase,
                startDate: query.startDate ? new Date(query.startDate) : undefined,
                endDate: query.endDate ? new Date(query.endDate) : undefined,
                page: query.page ? parseInt(query.page, 10) : undefined,
                limit: query.limit ? parseInt(query.limit, 10) : undefined,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取运行列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getRunDetail(id) {
        try {
            const run = await this.agentRunAdminService.getRunById(id);
            if (!run) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `运行 ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(run);
        }
        catch (error) {
            this.logger.error(`获取运行详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAttempts(query) {
        try {
            const result = await this.agentRunAdminService.getAttempts({
                tripRunId: query.tripRunId,
                status: query.status,
                page: query.page ? parseInt(query.page, 10) : undefined,
                limit: query.limit ? parseInt(query.limit, 10) : undefined,
                sortBy: query.sortBy,
                sortOrder: query.sortOrder,
            });
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            this.logger.error(`获取 Attempt 列表失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async getAttemptDetail(id) {
        try {
            const attempt = await this.agentRunAdminService.getAttemptById(id);
            if (!attempt) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.NOT_FOUND, `Attempt ${id} 不存在`);
            }
            return (0, standard_response_dto_1.successResponse)(attempt);
        }
        catch (error) {
            this.logger.error(`获取 Attempt 详情失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async cancelRun(id) {
        try {
            const success = await this.agentRunAdminService.cancelRun(id);
            if (!success) {
                return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, '取消运行失败');
            }
            return (0, standard_response_dto_1.successResponse)({ cancelled: true, runId: id });
        }
        catch (error) {
            this.logger.error(`取消运行失败: ${error.message}`, error.stack);
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.AgentAdminController = AgentAdminController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('runs/stats'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Agent 运行统计（管理接口）',
        description: '获取 TripRun 的统计信息，包括按状态、阶段的统计。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'planningPhase', required: false, type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回运行统计',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "getRunStats", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('performance'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Agent 性能分析（管理接口）',
        description: '获取 Agent 运行的性能分析，包括平均耗时、P50/P95/P99等指标。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回性能分析',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "getPerformance", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('runs'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Agent 运行列表（管理接口）',
        description: '获取 TripRun 列表，支持分页、筛选、排序。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'tripId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'userId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['IN_PROGRESS', 'COMPLETED', 'FAILED'] }),
    (0, swagger_1.ApiQuery)({ name: 'planningPhase', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'startDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'endDate', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'sortBy', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回运行列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "getRuns", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('runs/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Agent 运行详情（管理接口）',
        description: '获取单个 TripRun 的详细信息，包含所有关联的 TripAttempt。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'TripRun ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回运行详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: '运行不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "getRunDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('attempts'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Attempt 列表（管理接口）',
        description: '获取 TripAttempt 列表，支持分页、筛选。',
    }),
    (0, swagger_1.ApiQuery)({ name: 'page', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'limit', required: false, type: Number }),
    (0, swagger_1.ApiQuery)({ name: 'tripRunId', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'status', required: false, enum: ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED'] }),
    (0, swagger_1.ApiQuery)({ name: 'sortBy', required: false, type: String }),
    (0, swagger_1.ApiQuery)({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Attempt 列表',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Query)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "getAttempts", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('attempts/:id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取 Attempt 详情（管理接口）',
        description: '获取单个 TripAttempt 的详细信息。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'TripAttempt ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回 Attempt 详情',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    (0, swagger_1.ApiResponse)({
        status: 404,
        description: 'Attempt 不存在',
        type: api_response_dto_1.ApiErrorResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "getAttemptDetail", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('runs/:id/cancel'),
    (0, swagger_1.ApiOperation)({
        summary: '取消运行（管理接口）',
        description: '取消指定的 TripRun，将其状态设置为 FAILED。',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: 'TripRun ID' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功取消运行',
        type: api_response_dto_1.ApiSuccessResponseDto,
    }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], AgentAdminController.prototype, "cancelRun", null);
exports.AgentAdminController = AgentAdminController = AgentAdminController_1 = __decorate([
    (0, swagger_1.ApiTags)('agent-admin'),
    (0, common_1.Controller)('agent/admin'),
    __metadata("design:paramtypes", [agent_run_admin_service_1.AgentRunAdminService])
], AgentAdminController);
//# sourceMappingURL=agent-admin.controller.js.map