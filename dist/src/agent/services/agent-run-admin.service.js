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
var AgentRunAdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.AgentRunAdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
const postgresql_mcp_service_1 = require("../../mcp/postgresql-mcp.service");
let AgentRunAdminService = AgentRunAdminService_1 = class AgentRunAdminService {
    constructor(prisma, postgresqlMcp) {
        this.prisma = prisma;
        this.postgresqlMcp = postgresqlMcp;
        this.logger = new common_1.Logger(AgentRunAdminService_1.name);
    }
    isValidUUID(uuid) {
        if (!uuid || typeof uuid !== 'string') {
            return false;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid.trim());
    }
    async getRuns(filters) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (filters.tripId) {
            if (this.isValidUUID(filters.tripId)) {
                where.tripId = filters.tripId.trim();
            }
            else {
                this.logger.warn(`Invalid tripId format: ${filters.tripId}, ignoring filter`);
            }
        }
        if (filters.userId) {
            if (this.isValidUUID(filters.userId)) {
                where.userId = filters.userId.trim();
            }
            else {
                this.logger.warn(`Invalid userId format: ${filters.userId}, ignoring filter`);
            }
        }
        if (filters.status) {
            where.status = filters.status;
        }
        if (filters.planningPhase) {
            where.planningPhase = filters.planningPhase;
        }
        if (filters.startDate || filters.endDate) {
            where.createdAt = {};
            if (filters.startDate) {
                where.createdAt.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.createdAt.lte = filters.endDate;
            }
        }
        const orderBy = {};
        const sortBy = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder || 'desc';
        orderBy[sortBy] = sortOrder;
        const total = await this.prisma.tripRun.count({ where });
        const runs = await this.prisma.tripRun.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            include: {
                TripAttempt: {
                    orderBy: { attemptNumber: 'desc' },
                    take: 1,
                },
            },
        });
        const items = runs.map(run => {
            var _a;
            return ({
                id: run.id,
                tripId: run.tripId,
                userId: run.userId,
                userQuery: run.userQuery,
                planningPhase: run.planningPhase,
                currentAgent: run.currentAgent,
                status: run.status,
                createdAt: run.createdAt.toISOString(),
                updatedAt: run.updatedAt.toISOString(),
                completedAt: (_a = run.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
                metadata: run.metadata || {},
                latestAttempt: run.TripAttempt[0] ? {
                    id: run.TripAttempt[0].id,
                    attemptNumber: run.TripAttempt[0].attemptNumber,
                    status: run.TripAttempt[0].status,
                    createdAt: run.TripAttempt[0].createdAt.toISOString(),
                } : null,
                duration: run.completedAt
                    ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
                    : null,
            });
        });
        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async getRunById(runId) {
        var _a;
        if (!this.isValidUUID(runId)) {
            this.logger.warn(`Invalid runId format: ${runId}`);
            return null;
        }
        const run = await this.prisma.tripRun.findUnique({
            where: { id: runId.trim() },
            include: {
                TripAttempt: {
                    orderBy: { attemptNumber: 'asc' },
                },
            },
        });
        if (!run) {
            return null;
        }
        return {
            id: run.id,
            tripId: run.tripId,
            userId: run.userId,
            userQuery: run.userQuery,
            planningPhase: run.planningPhase,
            currentAgent: run.currentAgent,
            status: run.status,
            createdAt: run.createdAt.toISOString(),
            updatedAt: run.updatedAt.toISOString(),
            completedAt: (_a = run.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
            metadata: run.metadata || {},
            attempts: run.TripAttempt.map(attempt => {
                var _a;
                return ({
                    id: attempt.id,
                    attemptNumber: attempt.attemptNumber,
                    planOutline: attempt.planOutline,
                    openQuestions: attempt.openQuestions || [],
                    constraintsAssumed: attempt.constraintsAssumed || [],
                    nextActions: attempt.nextActions || [],
                    failureNotes: attempt.failureNotes,
                    status: attempt.status,
                    resultSummary: attempt.resultSummary,
                    artifacts: attempt.artifacts || {},
                    createdAt: attempt.createdAt.toISOString(),
                    updatedAt: attempt.updatedAt.toISOString(),
                    completedAt: (_a = attempt.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
                    metadata: attempt.metadata || {},
                });
            }),
            duration: run.completedAt
                ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
                : Math.floor((new Date().getTime() - run.createdAt.getTime()) / 1000),
        };
    }
    async getRunStats(filters) {
        var _a, _b, _c, _d;
        const where = {};
        if ((filters === null || filters === void 0 ? void 0 : filters.startDate) || (filters === null || filters === void 0 ? void 0 : filters.endDate)) {
            where.createdAt = {};
            if (filters.startDate) {
                where.createdAt.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.createdAt.lte = filters.endDate;
            }
        }
        if (filters === null || filters === void 0 ? void 0 : filters.planningPhase) {
            where.planningPhase = filters.planningPhase;
        }
        const total = await this.prisma.tripRun.count({ where });
        const byStatus = await this.prisma.tripRun.groupBy({
            by: ['status'],
            where,
            _count: true,
        });
        const byPhase = await this.prisma.tripRun.groupBy({
            by: ['planningPhase'],
            where,
            _count: true,
        });
        const completedRuns = await this.prisma.tripRun.findMany({
            where: {
                ...where,
                status: 'COMPLETED',
                completedAt: { not: null },
            },
            select: {
                createdAt: true,
                completedAt: true,
            },
        });
        const durations = completedRuns
            .map(run => run.completedAt
            ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
            : null)
            .filter((d) => d !== null);
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;
        return {
            summary: {
                totalRuns: total,
                completedRuns: ((_a = byStatus.find(s => s.status === 'COMPLETED')) === null || _a === void 0 ? void 0 : _a._count) || 0,
                failedRuns: ((_b = byStatus.find(s => s.status === 'FAILED')) === null || _b === void 0 ? void 0 : _b._count) || 0,
                inProgressRuns: ((_c = byStatus.find(s => s.status === 'IN_PROGRESS')) === null || _c === void 0 ? void 0 : _c._count) || 0,
                successRate: total > 0
                    ? (((_d = byStatus.find(s => s.status === 'COMPLETED')) === null || _d === void 0 ? void 0 : _d._count) || 0) / total
                    : 0,
                avgDuration,
            },
            byStatus: byStatus.map(s => ({
                status: s.status,
                count: s._count,
                percentage: total > 0 ? (s._count / total) * 100 : 0,
            })),
            byPhase: byPhase.map(p => ({
                phase: p.planningPhase,
                count: p._count,
                percentage: total > 0 ? (p._count / total) * 100 : 0,
            })),
        };
    }
    async getAttempts(filters) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (filters.tripRunId) {
            if (this.isValidUUID(filters.tripRunId)) {
                where.tripRunId = filters.tripRunId.trim();
            }
            else {
                this.logger.warn(`Invalid tripRunId format: ${filters.tripRunId}, ignoring filter`);
            }
        }
        if (filters.status) {
            where.status = filters.status;
        }
        const orderBy = {};
        const sortBy = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder || 'desc';
        orderBy[sortBy] = sortOrder;
        const total = await this.prisma.tripAttempt.count({ where });
        const attempts = await this.prisma.tripAttempt.findMany({
            where,
            orderBy,
            skip,
            take: limit,
            include: {
                TripRun: {
                    select: {
                        id: true,
                        tripId: true,
                        userId: true,
                        userQuery: true,
                        planningPhase: true,
                    },
                },
            },
        });
        const items = attempts.map(attempt => {
            var _a;
            return ({
                id: attempt.id,
                tripRunId: attempt.tripRunId,
                attemptNumber: attempt.attemptNumber,
                planOutline: attempt.planOutline,
                openQuestions: attempt.openQuestions || [],
                constraintsAssumed: attempt.constraintsAssumed || [],
                nextActions: attempt.nextActions || [],
                failureNotes: attempt.failureNotes,
                status: attempt.status,
                resultSummary: attempt.resultSummary,
                artifacts: attempt.artifacts || {},
                createdAt: attempt.createdAt.toISOString(),
                updatedAt: attempt.updatedAt.toISOString(),
                completedAt: (_a = attempt.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
                metadata: attempt.metadata || {},
                run: {
                    id: attempt.TripRun.id,
                    tripId: attempt.TripRun.tripId,
                    userId: attempt.TripRun.userId,
                    userQuery: attempt.TripRun.userQuery,
                    planningPhase: attempt.TripRun.planningPhase,
                },
                duration: attempt.completedAt
                    ? Math.floor((attempt.completedAt.getTime() - attempt.createdAt.getTime()) / 1000)
                    : null,
            });
        });
        return {
            items,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
            },
        };
    }
    async getAttemptById(attemptId) {
        var _a;
        if (!this.isValidUUID(attemptId)) {
            this.logger.warn(`Invalid attemptId format: ${attemptId}`);
            return null;
        }
        const attempt = await this.prisma.tripAttempt.findUnique({
            where: { id: attemptId.trim() },
            include: {
                TripRun: true,
            },
        });
        if (!attempt) {
            return null;
        }
        return {
            id: attempt.id,
            tripRunId: attempt.tripRunId,
            attemptNumber: attempt.attemptNumber,
            planOutline: attempt.planOutline,
            openQuestions: attempt.openQuestions || [],
            constraintsAssumed: attempt.constraintsAssumed || [],
            nextActions: attempt.nextActions || [],
            failureNotes: attempt.failureNotes,
            status: attempt.status,
            resultSummary: attempt.resultSummary,
            artifacts: attempt.artifacts || {},
            createdAt: attempt.createdAt.toISOString(),
            updatedAt: attempt.updatedAt.toISOString(),
            completedAt: (_a = attempt.completedAt) === null || _a === void 0 ? void 0 : _a.toISOString(),
            metadata: attempt.metadata || {},
            run: {
                id: attempt.TripRun.id,
                tripId: attempt.TripRun.tripId,
                userId: attempt.TripRun.userId,
                userQuery: attempt.TripRun.userQuery,
                planningPhase: attempt.TripRun.planningPhase,
                currentAgent: attempt.TripRun.currentAgent,
                status: attempt.TripRun.status,
                createdAt: attempt.TripRun.createdAt.toISOString(),
            },
            duration: attempt.completedAt
                ? Math.floor((attempt.completedAt.getTime() - attempt.createdAt.getTime()) / 1000)
                : null,
        };
    }
    async cancelRun(runId) {
        if (!this.isValidUUID(runId)) {
            this.logger.warn(`Invalid runId format: ${runId}`);
            return false;
        }
        try {
            await this.prisma.tripRun.update({
                where: { id: runId.trim() },
                data: {
                    status: 'FAILED',
                    completedAt: new Date(),
                    metadata: {
                        cancelled: true,
                        cancelledAt: new Date().toISOString(),
                    },
                },
            });
            return true;
        }
        catch (error) {
            this.logger.error(`取消运行失败: ${error.message}`, error.stack);
            return false;
        }
    }
    async getPerformanceAnalysis(filters) {
        const where = {
            status: 'COMPLETED',
            completedAt: { not: null },
        };
        if ((filters === null || filters === void 0 ? void 0 : filters.startDate) || (filters === null || filters === void 0 ? void 0 : filters.endDate)) {
            where.createdAt = {};
            if (filters.startDate) {
                where.createdAt.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.createdAt.lte = filters.endDate;
            }
        }
        const runs = await this.prisma.tripRun.findMany({
            where,
            select: {
                createdAt: true,
                completedAt: true,
                planningPhase: true,
                status: true,
            },
        });
        const durations = runs
            .map(run => run.completedAt
            ? Math.floor((run.completedAt.getTime() - run.createdAt.getTime()) / 1000)
            : null)
            .filter((d) => d !== null)
            .sort((a, b) => a - b);
        if (durations.length === 0) {
            return {
                avgDuration: 0,
                p50Duration: 0,
                p95Duration: 0,
                p99Duration: 0,
                minDuration: 0,
                maxDuration: 0,
                totalRuns: 0,
            };
        }
        const p50Index = Math.floor(durations.length * 0.5);
        const p95Index = Math.floor(durations.length * 0.95);
        const p99Index = Math.floor(durations.length * 0.99);
        return {
            avgDuration: durations.reduce((a, b) => a + b, 0) / durations.length,
            p50Duration: durations[p50Index] || 0,
            p95Duration: durations[p95Index] || 0,
            p99Duration: durations[p99Index] || 0,
            minDuration: durations[0],
            maxDuration: durations[durations.length - 1],
            totalRuns: durations.length,
        };
    }
    async batchUpdateRunStatus(runIds, status) {
        if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
            this.logger.warn('PostgreSQL MCP service not available, falling back to individual updates');
            let updated = 0;
            for (const runId of runIds) {
                try {
                    await this.prisma.tripRun.update({
                        where: { id: runId },
                        data: { status },
                    });
                    updated++;
                }
                catch (error) {
                    this.logger.warn(`Failed to update run ${runId}: ${error.message}`);
                }
            }
            return updated;
        }
        try {
            const query = `
        UPDATE "TripRun"
        SET 
          status = $1,
          updated_at = NOW()
        WHERE id = ANY($2::uuid[])
      `;
            const result = await this.postgresqlMcp.execute(query, [status, runIds]);
            return result.rowCount || 0;
        }
        catch (error) {
            this.logger.error(`批量更新 TripRun 状态失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async cleanupExpiredRuns(retentionDays = 90) {
        if (!this.postgresqlMcp || !this.postgresqlMcp.isAvailable()) {
            throw new Error('PostgreSQL MCP service not available for cleanup operation');
        }
        try {
            const query = `
        DELETE FROM "TripRun"
        WHERE status = 'COMPLETED'
          AND completed_at < NOW() - INTERVAL '${retentionDays} days'
      `;
            const result = await this.postgresqlMcp.execute(query);
            return result.rowCount || 0;
        }
        catch (error) {
            this.logger.error(`清理过期 TripRun 失败: ${error.message}`, error.stack);
            throw error;
        }
    }
};
exports.AgentRunAdminService = AgentRunAdminService;
exports.AgentRunAdminService = AgentRunAdminService = AgentRunAdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        postgresql_mcp_service_1.PostgreSQLMcpService])
], AgentRunAdminService);
//# sourceMappingURL=agent-run-admin.service.js.map