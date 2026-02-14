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
var ExecutionController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ExecutionController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const execution_agent_service_1 = require("./services/execution-agent.service");
const standard_response_dto_1 = require("../common/dto/standard-response.dto");
const public_decorator_1 = require("../auth/decorators/public.decorator");
const reorder_dto_1 = require("./dto/reorder.dto");
const apply_fallback_dto_1 = require("./dto/apply-fallback.dto");
let ExecutionController = ExecutionController_1 = class ExecutionController {
    constructor(executionAgent) {
        this.executionAgent = executionAgent;
        this.logger = new common_1.Logger(ExecutionController_1.name);
        this.logger.log(`[ExecutionController] 控制器已创建，executionAgent: ${!!this.executionAgent}`);
    }
    async health() {
        return (0, standard_response_dto_1.successResponse)({ status: 'ok', message: 'ExecutionController is working' });
    }
    async execute(request) {
        try {
            const result = await this.executionAgent.execute(request);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async reorder(request) {
        try {
            const result = await this.executionAgent.reorder(request);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async applyFallback(request) {
        try {
            const result = await this.executionAgent.applyFallback(request);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
    async previewFallback(solutionId) {
        try {
            const result = await this.executionAgent.previewFallback(solutionId);
            return (0, standard_response_dto_1.successResponse)(result);
        }
        catch (error) {
            return (0, standard_response_dto_1.errorResponse)(standard_response_dto_1.ErrorCode.INTERNAL_ERROR, error.message);
        }
    }
};
exports.ExecutionController = ExecutionController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('health'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行控制器健康检查',
        description: '用于测试路由是否注册',
    }),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", []),
    __metadata("design:returntype", Promise)
], ExecutionController.prototype, "health", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('execute'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '执行执行阶段流程',
        description: '执行阶段的 Agent，负责处理行程执行中的各种事件和变更',
    }),
    (0, swagger_1.ApiBody)({
        description: '执行阶段请求',
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string' },
                action: {
                    type: 'string',
                    enum: ['remind', 'handle_change', 'fallback'],
                },
            },
            required: ['tripId', 'action'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '执行成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [Object]),
    __metadata("design:returntype", Promise)
], ExecutionController.prototype, "execute", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('reorder'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '重新排序行程',
        description: '重新排序指定日期的行程项顺序',
    }),
    (0, swagger_1.ApiBody)({
        description: '重新排序请求',
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string' },
                dayId: { type: 'string' },
                newOrder: { type: 'array', items: { type: 'string' } },
                reason: { type: 'string' },
            },
            required: ['tripId', 'dayId', 'newOrder'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '重新排序成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [reorder_dto_1.ReorderRequestDto]),
    __metadata("design:returntype", Promise)
], ExecutionController.prototype, "reorder", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)('apply-fallback'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '应用修复方案',
        description: '应用Neptune提供的修复方案',
    }),
    (0, swagger_1.ApiBody)({
        description: '应用修复方案请求',
        schema: {
            type: 'object',
            properties: {
                tripId: { type: 'string' },
                solutionId: { type: 'string' },
                confirm: { type: 'boolean' },
            },
            required: ['tripId', 'solutionId'],
        },
    }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '应用修复方案成功',
    }),
    __param(0, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [apply_fallback_dto_1.ApplyFallbackRequestDto]),
    __metadata("design:returntype", Promise)
], ExecutionController.prototype, "applyFallback", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('fallback/:solutionId/preview'),
    (0, common_1.HttpCode)(common_1.HttpStatus.OK),
    (0, swagger_1.ApiOperation)({
        summary: '预览修复方案',
        description: '预览修复方案的详细变更内容',
    }),
    (0, swagger_1.ApiParam)({ name: 'solutionId', description: '修复方案ID', example: 'solution-uuid' }),
    (0, swagger_1.ApiResponse)({
        status: 200,
        description: '成功返回修复方案预览',
    }),
    __param(0, (0, common_1.Param)('solutionId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ExecutionController.prototype, "previewFallback", null);
exports.ExecutionController = ExecutionController = ExecutionController_1 = __decorate([
    (0, swagger_1.ApiTags)('execution'),
    (0, common_1.Controller)('execution'),
    __metadata("design:paramtypes", [execution_agent_service_1.ExecutionAgentService])
], ExecutionController);
//# sourceMappingURL=execution.controller.js.map