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
var ApprovalService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let ApprovalService = ApprovalService_1 = class ApprovalService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ApprovalService_1.name);
    }
    isDatabaseAvailable() {
        return !!this.prisma && this.prisma.isDbConnected();
    }
    async createRequest(data) {
        if (!this.isDatabaseAvailable()) {
            throw new Error('数据库不可用，无法创建审批请求。请确保 DATABASE_URL 已配置。');
        }
        try {
            const request = await this.prisma.approvalRequest.create({
                data: {
                    threadId: data.threadId,
                    agentRunId: data.agentRunId,
                    toolCallId: data.toolCallId,
                    skillName: data.skillName,
                    summary: data.summary,
                    description: data.description,
                    payload: data.payload,
                    riskLevel: data.riskLevel,
                    status: client_1.ApprovalStatus.PENDING,
                    expiresAt: data.expiresAt || new Date(Date.now() + 24 * 60 * 60 * 1000),
                    metadata: data.metadata || {},
                },
            });
            this.logger.log(`创建审批请求: ${request.id} (threadId: ${data.threadId})`);
            return request;
        }
        catch (error) {
            this.logger.error(`创建审批请求失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async handleDecision(requestId, data) {
        if (!this.isDatabaseAvailable()) {
            throw new Error('数据库不可用，无法处理审批请求。');
        }
        const request = await this.prisma.approvalRequest.findUnique({
            where: { id: requestId },
        });
        if (!request) {
            throw new common_1.NotFoundException(`审批请求不存在: ${requestId}`);
        }
        if (request.status !== client_1.ApprovalStatus.PENDING) {
            throw new Error(`审批请求状态为 ${request.status}，无法更新`);
        }
        if (request.expiresAt && request.expiresAt < new Date()) {
            const expired = await this.prisma.approvalRequest.update({
                where: { id: requestId },
                data: {
                    status: client_1.ApprovalStatus.EXPIRED,
                    handledAt: new Date(),
                },
            });
            throw new Error(`审批请求已过期: ${requestId}`);
        }
        const status = data.approved ? client_1.ApprovalStatus.APPROVED : client_1.ApprovalStatus.REJECTED;
        const updated = await this.prisma.approvalRequest.update({
            where: { id: requestId },
            data: {
                status,
                decisionNote: data.decisionNote,
                handledAt: new Date(),
                metadata: {
                    ...(request.metadata || {}),
                    userId: data.userId,
                    decisionTimestamp: new Date().toISOString(),
                },
            },
        });
        this.logger.log(`审批请求已处理: ${requestId} (${status})`);
        return updated;
    }
    async checkStatus(requestId) {
        if (!this.isDatabaseAvailable()) {
            return null;
        }
        const request = await this.prisma.approvalRequest.findUnique({
            where: { id: requestId },
        });
        if (!request) {
            return null;
        }
        if (request.status === client_1.ApprovalStatus.PENDING && request.expiresAt && request.expiresAt < new Date()) {
            return await this.prisma.approvalRequest.update({
                where: { id: requestId },
                data: {
                    status: client_1.ApprovalStatus.EXPIRED,
                    handledAt: new Date(),
                },
            });
        }
        return request;
    }
    async getPendingApprovalsByThreadId(threadId) {
        if (!this.isDatabaseAvailable()) {
            return [];
        }
        return this.prisma.approvalRequest.findMany({
            where: {
                threadId,
                status: client_1.ApprovalStatus.PENDING,
                OR: [
                    { expiresAt: null },
                    { expiresAt: { gt: new Date() } },
                ],
            },
            orderBy: {
                createdAt: 'desc',
            },
        });
    }
    async findByToolCallId(toolCallId) {
        if (!this.isDatabaseAvailable()) {
            return null;
        }
        return this.prisma.approvalRequest.findFirst({
            where: { toolCallId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async cancelRequest(requestId, reason) {
        if (!this.isDatabaseAvailable()) {
            throw new Error('数据库不可用，无法取消审批请求。');
        }
        const request = await this.prisma.approvalRequest.findUnique({
            where: { id: requestId },
        });
        if (!request) {
            throw new common_1.NotFoundException(`审批请求不存在: ${requestId}`);
        }
        if (request.status !== client_1.ApprovalStatus.PENDING) {
            throw new Error(`审批请求状态为 ${request.status}，无法取消`);
        }
        return this.prisma.approvalRequest.update({
            where: { id: requestId },
            data: {
                status: client_1.ApprovalStatus.CANCELLED,
                decisionNote: reason || '已取消',
                handledAt: new Date(),
            },
        });
    }
    async cleanupExpiredRequests() {
        if (!this.isDatabaseAvailable()) {
            return 0;
        }
        const now = new Date();
        const result = await this.prisma.approvalRequest.updateMany({
            where: {
                status: client_1.ApprovalStatus.PENDING,
                expiresAt: {
                    lt: now,
                },
            },
            data: {
                status: client_1.ApprovalStatus.EXPIRED,
                handledAt: now,
            },
        });
        if (result.count > 0) {
            this.logger.log(`清理了 ${result.count} 个过期的审批请求`);
        }
        return result.count;
    }
};
exports.ApprovalService = ApprovalService;
exports.ApprovalService = ApprovalService = ApprovalService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ApprovalService);
//# sourceMappingURL=approval.service.js.map