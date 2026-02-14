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
var ApprovalStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ApprovalStorageService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const client_1 = require("@prisma/client");
let ApprovalStorageService = ApprovalStorageService_1 = class ApprovalStorageService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ApprovalStorageService_1.name);
        this.useDatabase = false;
        this.approvalStore = new Map();
    }
    async onModuleInit() {
        this.logger.log('[ApprovalStorageService] onModuleInit 开始执行...');
        this.useDatabase = !!this.prisma && this.prisma.isDbConnected();
        if (this.useDatabase) {
            this.logger.log('ApprovalStorageService 初始化完成（使用数据库存储）');
        }
        else {
            this.logger.log('ApprovalStorageService 初始化完成（使用内存存储）');
            if (!this.prisma) {
                this.logger.warn('ApprovalStorageService: PrismaService 未注入');
            }
            else if (!this.prisma.isDbConnected()) {
                this.logger.warn('ApprovalStorageService: 数据库不可用，使用内存存储。' +
                    '数据在重启后会丢失。如需启用数据库存储，请确保 DATABASE_URL 已配置且数据库可访问。');
            }
            this.startExpirationCleanup();
        }
        this.logger.log('[ApprovalStorageService] onModuleInit 执行完成');
    }
    async createApprovalRequest(request) {
        var _a, _b;
        this.logger.log(`创建审批请求: ${request.id} (threadId: ${request.threadId})`);
        if (this.useDatabase && this.prisma) {
            try {
                const dbRequest = await this.prisma.approvalRequest.create({
                    data: {
                        threadId: request.threadId,
                        agentRunId: request.agentRunId,
                        toolCallId: request.toolCallId,
                        skillName: request.skillName,
                        summary: request.summary || ((_a = request.userPrompt) === null || _a === void 0 ? void 0 : _a.title) || '',
                        description: request.description || ((_b = request.userPrompt) === null || _b === void 0 ? void 0 : _b.description),
                        payload: request.payload,
                        riskLevel: request.riskLevel || 'medium',
                        status: this.mapStatusToApprovalStatus(request.status),
                        expiresAt: request.expiresAt,
                        metadata: {
                            ...(request.userPrompt ? { userPrompt: request.userPrompt } : {}),
                            ...(request.metadata || {}),
                        },
                    },
                });
                return this.mapDbToEntity(dbRequest);
            }
            catch (error) {
                this.logger.error(`保存审批请求到数据库失败: ${error.message}`, error.stack);
                this.approvalStore.set(request.id, request);
                return request;
            }
        }
        else {
            this.approvalStore.set(request.id, request);
            return request;
        }
    }
    async getApprovalRequest(id) {
        if (this.useDatabase && this.prisma) {
            try {
                const dbRequest = await this.prisma.approvalRequest.findUnique({
                    where: { id },
                });
                if (!dbRequest) {
                    return null;
                }
                if (dbRequest.status === client_1.ApprovalStatus.PENDING &&
                    dbRequest.expiresAt &&
                    dbRequest.expiresAt < new Date()) {
                    const updated = await this.prisma.approvalRequest.update({
                        where: { id },
                        data: {
                            status: client_1.ApprovalStatus.EXPIRED,
                            handledAt: new Date(),
                        },
                    });
                    return this.mapDbToEntity(updated);
                }
                return this.mapDbToEntity(dbRequest);
            }
            catch (error) {
                this.logger.error(`从数据库获取审批请求失败: ${error.message}`, error.stack);
                return this.approvalStore.get(id) || null;
            }
        }
        else {
            const request = this.approvalStore.get(id);
            if (!request) {
                return null;
            }
            if (request.expiresAt && request.expiresAt < new Date()) {
                if (request.status === 'pending') {
                    request.status = 'expired';
                    await this.updateApprovalRequest(id, { status: 'expired' });
                }
            }
            return request;
        }
    }
    async updateApprovalRequest(id, updates) {
        var _a;
        this.logger.log(`更新审批请求: ${id} (status: ${updates.status || 'unknown'})`);
        if (this.useDatabase && this.prisma) {
            try {
                const dbUpdates = {};
                if (updates.status) {
                    dbUpdates.status = this.mapStatusToApprovalStatus(updates.status);
                }
                if (updates.expiresAt !== undefined) {
                    dbUpdates.expiresAt = updates.expiresAt;
                }
                if (updates.result) {
                    dbUpdates.handledAt = updates.result.timestamp || new Date();
                    dbUpdates.decisionNote = updates.result.userFeedback;
                    const existingRequest = await this.prisma.approvalRequest.findUnique({ where: { id } });
                    dbUpdates.metadata = {
                        ...((existingRequest === null || existingRequest === void 0 ? void 0 : existingRequest.metadata) || {}),
                        userId: updates.result.userId,
                        decisionTimestamp: (_a = updates.result.timestamp) === null || _a === void 0 ? void 0 : _a.toISOString(),
                    };
                }
                if (updates.userPrompt) {
                    const existingRequest = await this.prisma.approvalRequest.findUnique({ where: { id } });
                    dbUpdates.metadata = {
                        ...((existingRequest === null || existingRequest === void 0 ? void 0 : existingRequest.metadata) || {}),
                        userPrompt: updates.userPrompt,
                    };
                }
                if (updates.payload) {
                    dbUpdates.payload = updates.payload;
                }
                const updated = await this.prisma.approvalRequest.update({
                    where: { id },
                    data: dbUpdates,
                });
                return this.mapDbToEntity(updated);
            }
            catch (error) {
                this.logger.error(`更新审批请求到数据库失败: ${error.message}`, error.stack);
                const request = this.approvalStore.get(id);
                if (!request) {
                    return null;
                }
                const updated = { ...request, ...updates };
                this.approvalStore.set(id, updated);
                return updated;
            }
        }
        else {
            const request = this.approvalStore.get(id);
            if (!request) {
                return null;
            }
            const updated = { ...request, ...updates };
            this.approvalStore.set(id, updated);
            return updated;
        }
    }
    async getPendingApprovalsByThreadId(threadId) {
        if (this.useDatabase && this.prisma) {
            try {
                const dbRequests = await this.prisma.approvalRequest.findMany({
                    where: {
                        threadId,
                        status: client_1.ApprovalStatus.PENDING,
                        OR: [
                            { expiresAt: null },
                            { expiresAt: { gt: new Date() } },
                        ],
                    },
                    orderBy: { createdAt: 'desc' },
                });
                return dbRequests.map(req => this.mapDbToEntity(req));
            }
            catch (error) {
                this.logger.error(`从数据库查询待审批请求失败: ${error.message}`, error.stack);
                return Array.from(this.approvalStore.values()).filter((request) => request.threadId === threadId && request.status === 'pending');
            }
        }
        else {
            return Array.from(this.approvalStore.values()).filter((request) => request.threadId === threadId && request.status === 'pending');
        }
    }
    async handleApprovalResponse(id, approved, userFeedback, userId) {
        const request = await this.getApprovalRequest(id);
        if (!request) {
            return null;
        }
        if (request.status !== 'pending') {
            this.logger.warn(`审批请求 ${id} 状态为 ${request.status}，无法更新`);
            return request;
        }
        const updates = {
            status: approved ? 'approved' : 'rejected',
            result: {
                approved,
                timestamp: new Date(),
                userFeedback,
                userId,
            },
        };
        return await this.updateApprovalRequest(id, updates);
    }
    startExpirationCleanup() {
        if (this.useDatabase) {
            return;
        }
        setInterval(() => {
            const now = new Date();
            let expiredCount = 0;
            for (const [id, request] of this.approvalStore.entries()) {
                if (request.status === 'pending' &&
                    request.expiresAt &&
                    request.expiresAt < now) {
                    request.status = 'expired';
                    this.updateApprovalRequest(id, { status: 'expired' });
                    expiredCount++;
                }
            }
            if (expiredCount > 0) {
                this.logger.log(`清理了 ${expiredCount} 个过期的审批请求`);
            }
        }, 5 * 60 * 1000);
    }
    getAllApprovals() {
        if (this.useDatabase && this.prisma) {
            return [];
        }
        else {
            return Array.from(this.approvalStore.values());
        }
    }
    mapDbToEntity(dbRequest) {
        const metadata = (dbRequest.metadata || {});
        return {
            id: dbRequest.id,
            threadId: dbRequest.threadId,
            toolCallId: dbRequest.toolCallId || undefined,
            skillName: dbRequest.skillName,
            payload: dbRequest.payload,
            status: this.mapApprovalStatusToStatus(dbRequest.status),
            createdAt: dbRequest.createdAt,
            expiresAt: dbRequest.expiresAt || undefined,
            result: dbRequest.handledAt ? {
                approved: dbRequest.status === client_1.ApprovalStatus.APPROVED,
                timestamp: dbRequest.handledAt,
                userFeedback: dbRequest.decisionNote || undefined,
                userId: metadata.userId || undefined,
            } : undefined,
            userPrompt: metadata.userPrompt || undefined,
            metadata: metadata,
        };
    }
    mapApprovalStatusToStatus(status) {
        switch (status) {
            case client_1.ApprovalStatus.PENDING:
                return 'pending';
            case client_1.ApprovalStatus.APPROVED:
                return 'approved';
            case client_1.ApprovalStatus.REJECTED:
                return 'rejected';
            case client_1.ApprovalStatus.EXPIRED:
                return 'expired';
            case client_1.ApprovalStatus.CANCELLED:
                return 'expired';
            default:
                return 'pending';
        }
    }
    mapStatusToApprovalStatus(status) {
        switch (status) {
            case 'pending':
                return client_1.ApprovalStatus.PENDING;
            case 'approved':
                return client_1.ApprovalStatus.APPROVED;
            case 'rejected':
                return client_1.ApprovalStatus.REJECTED;
            case 'expired':
                return client_1.ApprovalStatus.EXPIRED;
            case 'auto-approved':
                return client_1.ApprovalStatus.APPROVED;
            default:
                return client_1.ApprovalStatus.PENDING;
        }
    }
};
exports.ApprovalStorageService = ApprovalStorageService;
exports.ApprovalStorageService = ApprovalStorageService = ApprovalStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ApprovalStorageService);
//# sourceMappingURL=approval-storage.service.js.map