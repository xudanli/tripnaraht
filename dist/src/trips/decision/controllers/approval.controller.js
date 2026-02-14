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
var ApprovalController_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalController = void 0;
const common_1 = require("@nestjs/common");
const swagger_1 = require("@nestjs/swagger");
const approval_service_1 = require("../services/approval.service");
const agent_resume_service_1 = require("../services/agent-resume.service");
const api_response_dto_1 = require("../../../common/dto/api-response.dto");
const public_decorator_1 = require("../../../auth/decorators/public.decorator");
const trajectory_collection_service_1 = require("../../../agent/training/services/trajectory-collection.service");
const client_1 = require("@prisma/client");
let ApprovalController = ApprovalController_1 = class ApprovalController {
    constructor(approvalService, agentResumeService, trajectoryCollection) {
        this.approvalService = approvalService;
        this.agentResumeService = agentResumeService;
        this.trajectoryCollection = trajectoryCollection;
        this.logger = new common_1.Logger(ApprovalController_1.name);
    }
    async getApproval(id) {
        const request = await this.approvalService.checkStatus(id);
        if (!request) {
            throw new common_1.NotFoundException(`审批请求不存在: ${id}`);
        }
        return request;
    }
    async getPendingApprovals(threadId) {
        return this.approvalService.getPendingApprovalsByThreadId(threadId);
    }
    async handleDecision(id, body) {
        const approvalRequest = await this.approvalService.handleDecision(id, {
            approved: body.approved,
            decisionNote: body.decisionNote,
            userId: body.userId,
        });
        if (this.trajectoryCollection && approvalRequest.agentRunId) {
            try {
                const trajectoryResult = await this.trajectoryCollection.findTrajectoryByRequestId(approvalRequest.agentRunId);
                if (trajectoryResult.trajectoryId) {
                    const userApproval = body.approved
                        ? client_1.ApprovalStatus.APPROVED
                        : client_1.ApprovalStatus.REJECTED;
                    await this.trajectoryCollection.updateTrajectoryWithApproval(trajectoryResult.trajectoryId, userApproval);
                    this.logger.debug(`轨迹审批状态已更新: trajectoryId=${trajectoryResult.trajectoryId}, approval=${userApproval}`);
                }
            }
            catch (error) {
                this.logger.warn(`更新轨迹审批状态失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        const shouldResume = body.resumeAgent !== false;
        if (shouldResume && approvalRequest.threadId) {
            try {
                await this.agentResumeService.resumeAgent(approvalRequest.threadId, id);
                this.logger.log(`Agent 已恢复: threadId=${approvalRequest.threadId}, approvalId=${id}`);
            }
            catch (error) {
                this.logger.error(`恢复 Agent 失败: ${error.message}`, error.stack);
            }
        }
        return {
            success: true,
            approval: approvalRequest,
            agentResumed: shouldResume,
        };
    }
    async cancelApproval(id, body = {}) {
        const request = await this.approvalService.cancelRequest(id, body.reason);
        return {
            success: true,
            approval: request,
        };
    }
    async resumeAgent(id) {
        const approvalRequest = await this.approvalService.checkStatus(id);
        if (!approvalRequest) {
            throw new common_1.NotFoundException(`审批请求不存在: ${id}`);
        }
        if (approvalRequest.status !== 'APPROVED' && approvalRequest.status !== 'REJECTED') {
            throw new common_1.BadRequestException(`只能恢复已审批的请求（当前状态: ${approvalRequest.status}）`);
        }
        if (!approvalRequest.threadId) {
            throw new common_1.BadRequestException('审批请求缺少 threadId，无法恢复 Agent');
        }
        const snapshot = await this.agentResumeService.resumeAgent(approvalRequest.threadId, id);
        if (!snapshot) {
            throw new common_1.BadRequestException('无法恢复 Agent：未找到 Agent 状态');
        }
        return {
            success: true,
            message: 'Agent 已恢复',
            snapshot: {
                threadId: snapshot.threadId,
                messageCount: snapshot.messages.length,
            },
        };
    }
};
exports.ApprovalController = ApprovalController;
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)(':id'),
    (0, swagger_1.ApiOperation)({
        summary: '获取审批请求详情',
        description: '根据审批请求 ID 获取审批请求的详细信息',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '审批请求 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '审批请求不存在', type: api_response_dto_1.ApiErrorResponseDto }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ApprovalController.prototype, "getApproval", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Get)('thread/:threadId/pending'),
    (0, swagger_1.ApiOperation)({
        summary: '获取会话的所有待审批请求',
        description: '获取指定会话/线程的所有待审批请求列表',
    }),
    (0, swagger_1.ApiParam)({ name: 'threadId', description: '会话/线程 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '获取成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    __param(0, (0, common_1.Param)('threadId')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ApprovalController.prototype, "getPendingApprovals", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':id/decision'),
    (0, swagger_1.ApiOperation)({
        summary: '处理审批请求（批准或拒绝）',
        description: '处理审批请求，可以批准或拒绝，并可选择是否立即恢复 Agent 执行',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '审批请求 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                approved: { type: 'boolean', description: '是否批准' },
                decisionNote: { type: 'string', description: '审批备注（可选）' },
                userId: { type: 'string', description: '用户 ID（可选）' },
                resumeAgent: { type: 'boolean', description: '是否立即恢复 Agent（默认 true）' },
            },
            required: ['approved'],
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '处理成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '审批请求不存在', type: api_response_dto_1.ApiErrorResponseDto }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApprovalController.prototype, "handleDecision", null);
__decorate([
    (0, common_1.Post)(':id/cancel'),
    (0, swagger_1.ApiOperation)({ summary: '取消审批请求' }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '审批请求 ID' }),
    (0, swagger_1.ApiBody)({
        schema: {
            type: 'object',
            properties: {
                reason: { type: 'string', description: '取消原因（可选）' },
            },
        },
    }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '取消成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '审批请求不存在', type: api_response_dto_1.ApiErrorResponseDto }),
    __param(0, (0, common_1.Param)('id')),
    __param(1, (0, common_1.Body)()),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String, Object]),
    __metadata("design:returntype", Promise)
], ApprovalController.prototype, "cancelApproval", null);
__decorate([
    (0, public_decorator_1.Public)(),
    (0, common_1.Post)(':id/resume-agent'),
    (0, swagger_1.ApiOperation)({
        summary: '手动触发 Agent 恢复',
        description: '手动触发 Agent 恢复执行，用于调试或手动恢复场景',
    }),
    (0, swagger_1.ApiParam)({ name: 'id', description: '审批请求 ID' }),
    (0, swagger_1.ApiResponse)({ status: 200, description: '恢复成功', type: api_response_dto_1.ApiSuccessResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 404, description: '审批请求不存在', type: api_response_dto_1.ApiErrorResponseDto }),
    (0, swagger_1.ApiResponse)({ status: 400, description: '请求状态无效', type: api_response_dto_1.ApiErrorResponseDto }),
    __param(0, (0, common_1.Param)('id')),
    __metadata("design:type", Function),
    __metadata("design:paramtypes", [String]),
    __metadata("design:returntype", Promise)
], ApprovalController.prototype, "resumeAgent", null);
exports.ApprovalController = ApprovalController = ApprovalController_1 = __decorate([
    (0, swagger_1.ApiTags)('decision'),
    (0, common_1.Controller)('approvals'),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [approval_service_1.ApprovalService,
        agent_resume_service_1.AgentResumeService,
        trajectory_collection_service_1.TrajectoryCollectionService])
], ApprovalController);
//# sourceMappingURL=approval.controller.js.map