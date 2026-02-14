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
var PlanningWorkbenchAdminService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlanningWorkbenchAdminService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let PlanningWorkbenchAdminService = PlanningWorkbenchAdminService_1 = class PlanningWorkbenchAdminService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(PlanningWorkbenchAdminService_1.name);
    }
    async getSessions(filters) {
        var _a, _b;
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (filters.tripId) {
            where.tripId = filters.tripId;
        }
        if (filters.status) {
            where.status = filters.status;
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
        if (filters.userId) {
            where.Trip = {
                TripCollaborator: {
                    some: {
                        userId: filters.userId,
                    },
                },
            };
        }
        const orderBy = {};
        const sortBy = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder || 'desc';
        orderBy[sortBy] = sortOrder;
        let total = 0;
        let plans = [];
        try {
            total = await this.prisma.planningPlan.count({ where });
            plans = await this.prisma.planningPlan.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                include: {
                    Trip: {
                        select: {
                            id: true,
                            destination: true,
                            startDate: true,
                            endDate: true,
                            status: true,
                            TripCollaborator: {
                                select: {
                                    userId: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            });
        }
        catch (error) {
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('planning_plans'))) {
                this.logger.warn('planning_plans 表不存在，返回空结果。请运行数据库迁移创建表。');
                return {
                    items: [],
                    pagination: {
                        page,
                        limit,
                        total: 0,
                        totalPages: 0,
                    },
                };
            }
            throw error;
        }
        const items = plans.map(plan => ({
            id: plan.id,
            tripId: plan.tripId,
            planVersion: plan.planVersion,
            status: plan.status,
            summary: plan.summary || {},
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString(),
            createdBy: plan.createdBy,
            trip: {
                id: plan.Trip.id,
                destination: plan.Trip.destination,
                startDate: plan.Trip.startDate.toISOString(),
                endDate: plan.Trip.endDate.toISOString(),
                status: plan.Trip.status,
                collaborators: plan.Trip.TripCollaborator,
            },
        }));
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
    async getSessionById(sessionId) {
        var _a, _b;
        let plan = null;
        try {
            plan = await this.prisma.planningPlan.findUnique({
                where: { id: sessionId },
                include: {
                    Trip: {
                        include: {
                            TripCollaborator: {
                                select: {
                                    userId: true,
                                    role: true,
                                    createdAt: true,
                                },
                            },
                        },
                    },
                },
            });
        }
        catch (error) {
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('planning_plans'))) {
                this.logger.warn('planning_plans 表不存在。请运行数据库迁移创建表。');
                return null;
            }
            throw error;
        }
        if (!plan) {
            return null;
        }
        return {
            id: plan.id,
            tripId: plan.tripId,
            planVersion: plan.planVersion,
            status: plan.status,
            planState: plan.planState,
            uiOutput: plan.uiOutput || {},
            summary: plan.summary || {},
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString(),
            createdBy: plan.createdBy,
            trip: {
                id: plan.Trip.id,
                destination: plan.Trip.destination,
                startDate: plan.Trip.startDate.toISOString(),
                endDate: plan.Trip.endDate.toISOString(),
                status: plan.Trip.status,
                collaborators: plan.Trip.TripCollaborator,
            },
        };
    }
    async getSessionStats(filters) {
        var _a, _b, _c, _d, _e, _f, _g;
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
        let total = 0;
        let byStatus = [];
        let plans = [];
        try {
            total = await this.prisma.planningPlan.count({ where });
            byStatus = (await this.prisma.planningPlan.groupBy({
                by: ['status'],
                where,
                _count: true,
            }));
            plans = await this.prisma.planningPlan.findMany({
                where,
                select: {
                    createdAt: true,
                    updatedAt: true,
                    status: true,
                },
            });
        }
        catch (error) {
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('planning_plans'))) {
                this.logger.warn('planning_plans 表不存在，返回空统计。请运行数据库迁移创建表。');
                return {
                    summary: {
                        totalSessions: 0,
                        lockedSessions: 0,
                        draftSessions: 0,
                        proposedSessions: 0,
                        needConfirmSessions: 0,
                        successRate: 0,
                        avgDuration: 0,
                    },
                    byStatus: [],
                };
            }
            throw error;
        }
        const durations = plans
            .map(plan => Math.floor((plan.updatedAt.getTime() - plan.createdAt.getTime()) / 1000))
            .filter(d => d > 0);
        const avgDuration = durations.length > 0
            ? durations.reduce((a, b) => a + b, 0) / durations.length
            : 0;
        const successCount = ((_c = byStatus.find(s => s.status === 'LOCKED')) === null || _c === void 0 ? void 0 : _c._count) || 0;
        const successRate = total > 0 ? successCount / total : 0;
        return {
            summary: {
                totalSessions: total,
                lockedSessions: ((_d = byStatus.find(s => s.status === 'LOCKED')) === null || _d === void 0 ? void 0 : _d._count) || 0,
                draftSessions: ((_e = byStatus.find(s => s.status === 'DRAFT')) === null || _e === void 0 ? void 0 : _e._count) || 0,
                proposedSessions: ((_f = byStatus.find(s => s.status === 'PROPOSED')) === null || _f === void 0 ? void 0 : _f._count) || 0,
                needConfirmSessions: ((_g = byStatus.find(s => s.status === 'NEED_CONFIRM')) === null || _g === void 0 ? void 0 : _g._count) || 0,
                successRate,
                avgDuration,
            },
            byStatus: byStatus.map(s => ({
                status: s.status,
                count: s._count,
                percentage: total > 0 ? (s._count / total) * 100 : 0,
            })),
        };
    }
    async getPlans(filters) {
        var _a, _b;
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (filters.tripId) {
            where.tripId = filters.tripId;
        }
        if (filters.status) {
            where.status = filters.status;
        }
        const orderBy = {};
        const sortBy = filters.sortBy || 'createdAt';
        const sortOrder = filters.sortOrder || 'desc';
        orderBy[sortBy] = sortOrder;
        let total = 0;
        let plans = [];
        try {
            total = await this.prisma.planningPlan.count({ where });
            plans = await this.prisma.planningPlan.findMany({
                where,
                orderBy,
                skip,
                take: limit,
                include: {
                    Trip: {
                        select: {
                            id: true,
                            destination: true,
                            startDate: true,
                            endDate: true,
                        },
                    },
                },
            });
        }
        catch (error) {
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('planning_plans'))) {
                this.logger.warn('planning_plans 表不存在，返回空结果。请运行数据库迁移创建表。');
                return {
                    items: [],
                    pagination: {
                        page,
                        limit,
                        total: 0,
                        totalPages: 0,
                    },
                };
            }
            throw error;
        }
        const items = plans.map(plan => ({
            id: plan.id,
            tripId: plan.tripId,
            planVersion: plan.planVersion,
            status: plan.status,
            summary: plan.summary || {},
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString(),
            createdBy: plan.createdBy,
            trip: {
                id: plan.Trip.id,
                destination: plan.Trip.destination,
                startDate: plan.Trip.startDate.toISOString(),
                endDate: plan.Trip.endDate.toISOString(),
            },
        }));
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
    async getPlanById(planId) {
        var _a, _b;
        let plan = null;
        try {
            plan = await this.prisma.planningPlan.findUnique({
                where: { id: planId },
                include: {
                    Trip: {
                        include: {
                            TripCollaborator: {
                                select: {
                                    userId: true,
                                    role: true,
                                },
                            },
                        },
                    },
                },
            });
        }
        catch (error) {
            if (((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('does not exist')) || ((_b = error.message) === null || _b === void 0 ? void 0 : _b.includes('planning_plans'))) {
                this.logger.warn('planning_plans 表不存在。请运行数据库迁移创建表。');
                return null;
            }
            throw error;
        }
        if (!plan) {
            return null;
        }
        return {
            id: plan.id,
            tripId: plan.tripId,
            planVersion: plan.planVersion,
            status: plan.status,
            planState: plan.planState,
            uiOutput: plan.uiOutput || {},
            summary: plan.summary || {},
            createdAt: plan.createdAt.toISOString(),
            updatedAt: plan.updatedAt.toISOString(),
            createdBy: plan.createdBy,
            trip: {
                id: plan.Trip.id,
                destination: plan.Trip.destination,
                startDate: plan.Trip.startDate.toISOString(),
                endDate: plan.Trip.endDate.toISOString(),
                status: plan.Trip.status,
                collaborators: plan.Trip.TripCollaborator,
            },
        };
    }
};
exports.PlanningWorkbenchAdminService = PlanningWorkbenchAdminService;
exports.PlanningWorkbenchAdminService = PlanningWorkbenchAdminService = PlanningWorkbenchAdminService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], PlanningWorkbenchAdminService);
//# sourceMappingURL=planning-workbench-admin.service.js.map