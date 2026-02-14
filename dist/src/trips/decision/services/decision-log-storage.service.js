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
var DecisionLogStorageService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.DecisionLogStorageService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let DecisionLogStorageService = DecisionLogStorageService_1 = class DecisionLogStorageService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(DecisionLogStorageService_1.name);
    }
    isValidUUID(str) {
        if (!str) {
            return false;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(str);
    }
    async saveLogEntry(entry, options) {
        try {
            const validTripId = (options === null || options === void 0 ? void 0 : options.tripId) && this.isValidUUID(options.tripId)
                ? options.tripId
                : null;
            if ((options === null || options === void 0 ? void 0 : options.tripId) && !this.isValidUUID(options.tripId)) {
                this.logger.warn(`tripId "${options.tripId}" 不是有效的 UUID 格式，将设置为 null。` +
                    `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
            }
            await this.prisma.decisionLog.create({
                data: {
                    tripId: validTripId,
                    countryCode: options === null || options === void 0 ? void 0 : options.countryCode,
                    routeDirectionId: options === null || options === void 0 ? void 0 : options.routeDirectionId,
                    persona: entry.persona,
                    action: entry.action,
                    decisionSource: entry.decisionSource,
                    decisionStage: entry.decisionStage,
                    explanation: entry.explanation,
                    reasonCodes: entry.reasonCodes,
                    evidenceRefs: entry.evidenceRefs || [],
                    timestamp: new Date(entry.timestamp),
                    metadata: (options === null || options === void 0 ? void 0 : options.metadata) || {},
                },
            });
            this.logger.debug(`Saved decision log: ${entry.persona} ${entry.action} (${entry.decisionSource})${validTripId ? ` for tripId: ${validTripId}` : ''}`);
        }
        catch (error) {
            this.logger.error(`Failed to save decision log: ${error}`, error instanceof Error ? error.stack : undefined);
        }
    }
    async saveLogEntries(entries, options) {
        if (entries.length === 0) {
            return;
        }
        try {
            const validTripId = (options === null || options === void 0 ? void 0 : options.tripId) && this.isValidUUID(options.tripId)
                ? options.tripId
                : null;
            if ((options === null || options === void 0 ? void 0 : options.tripId) && !this.isValidUUID(options.tripId)) {
                this.logger.warn(`tripId "${options.tripId}" 不是有效的 UUID 格式，将设置为 null。` +
                    `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
            }
            await this.prisma.decisionLog.createMany({
                data: entries.map(entry => ({
                    tripId: validTripId,
                    countryCode: options === null || options === void 0 ? void 0 : options.countryCode,
                    routeDirectionId: options === null || options === void 0 ? void 0 : options.routeDirectionId,
                    persona: entry.persona,
                    action: entry.action,
                    decisionSource: entry.decisionSource,
                    decisionStage: entry.decisionStage,
                    explanation: entry.explanation,
                    reasonCodes: entry.reasonCodes,
                    evidenceRefs: entry.evidenceRefs || [],
                    timestamp: new Date(entry.timestamp),
                    metadata: (options === null || options === void 0 ? void 0 : options.metadata) || {},
                })),
            });
            this.logger.debug(`Saved ${entries.length} decision logs${validTripId ? ` for tripId: ${validTripId}` : ' (no tripId)'}`);
        }
        catch (error) {
            this.logger.error(`Failed to save decision logs: ${error}`, error instanceof Error ? error.stack : undefined);
        }
    }
    async queryLogs(filters) {
        const where = {};
        if (filters.tripId) {
            if (this.isValidUUID(filters.tripId)) {
                where.tripId = filters.tripId;
            }
            else {
                this.logger.warn(`queryLogs: tripId "${filters.tripId}" 不是有效的 UUID 格式，将跳过该查询条件。` +
                    `有效的 UUID 格式应为：xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`);
                return [];
            }
        }
        if (filters.countryCode) {
            where.countryCode = filters.countryCode;
        }
        if (filters.routeDirectionId) {
            where.routeDirectionId = filters.routeDirectionId;
        }
        if (filters.persona) {
            where.persona = filters.persona;
        }
        if (filters.decisionSource) {
            where.decisionSource = filters.decisionSource;
        }
        if (filters.action) {
            where.action = filters.action;
        }
        if (filters.decisionStage) {
            where.decisionStage = filters.decisionStage;
        }
        if (filters.startDate || filters.endDate) {
            where.timestamp = {};
            if (filters.startDate) {
                where.timestamp.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.timestamp.lte = filters.endDate;
            }
        }
        const logs = await this.prisma.decisionLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: filters.limit || 1000,
        });
        return logs.map(log => ({
            persona: log.persona,
            action: log.action,
            explanation: log.explanation,
            reasonCodes: log.reasonCodes,
            evidenceRefs: log.evidenceRefs,
            timestamp: log.timestamp.toISOString(),
            decisionSource: log.decisionSource,
            decisionStage: (log.decisionStage || 'FINALIZE'),
        }));
    }
    async getLogById(logId) {
        try {
            const log = await this.prisma.decisionLog.findUnique({
                where: { id: logId },
            });
            if (!log) {
                return null;
            }
            return {
                persona: log.persona,
                action: log.action,
                explanation: log.explanation,
                reasonCodes: log.reasonCodes,
                evidenceRefs: log.evidenceRefs,
                timestamp: log.timestamp.toISOString(),
                decisionSource: log.decisionSource,
                decisionStage: (log.decisionStage || 'FINALIZE'),
            };
        }
        catch (error) {
            this.logger.error(`获取决策日志失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async updateLogMetadata(logId, metadata) {
        try {
            const existingLog = await this.prisma.decisionLog.findUnique({
                where: { id: logId },
            });
            if (!existingLog) {
                throw new Error(`决策日志 ${logId} 不存在`);
            }
            const updatedMetadata = {
                ...(existingLog.metadata || {}),
                ...metadata,
            };
            const updatedLog = await this.prisma.decisionLog.update({
                where: { id: logId },
                data: {
                    metadata: updatedMetadata,
                },
            });
            return {
                persona: updatedLog.persona,
                action: updatedLog.action,
                explanation: updatedLog.explanation,
                reasonCodes: updatedLog.reasonCodes,
                evidenceRefs: updatedLog.evidenceRefs,
                timestamp: updatedLog.timestamp.toISOString(),
                decisionSource: updatedLog.decisionSource,
                decisionStage: (updatedLog.decisionStage || 'FINALIZE'),
            };
        }
        catch (error) {
            this.logger.error(`更新决策日志元数据失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async queryLogsPaginated(filters) {
        const page = filters.page || 1;
        const limit = Math.min(filters.limit || 20, 100);
        const skip = (page - 1) * limit;
        const where = {};
        if (filters.tripId) {
            where.tripId = filters.tripId;
        }
        if (filters.persona) {
            where.persona = filters.persona;
        }
        if (filters.decisionSource) {
            where.decisionSource = filters.decisionSource;
        }
        if (filters.action) {
            where.action = filters.action;
        }
        if (filters.startDate || filters.endDate) {
            where.timestamp = {};
            if (filters.startDate) {
                where.timestamp.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.timestamp.lte = filters.endDate;
            }
        }
        if (filters.userId) {
            where.trip = {
                collaborators: {
                    some: {
                        userId: filters.userId,
                    },
                },
            };
        }
        const orderBy = {};
        const sortBy = filters.sortBy || 'timestamp';
        const sortOrder = filters.sortOrder || 'desc';
        orderBy[sortBy] = sortOrder;
        const total = await this.prisma.decisionLog.count({ where });
        const logs = await this.prisma.decisionLog.findMany({
            where,
            orderBy,
            skip,
            take: limit,
        });
        const items = logs.map(log => ({
            id: log.id,
            tripId: log.tripId,
            userId: undefined,
            persona: log.persona,
            action: log.action,
            explanation: log.explanation,
            reasonCodes: log.reasonCodes,
            decisionSource: log.decisionSource,
            decisionStage: log.decisionStage || 'FINALIZE',
            timestamp: log.timestamp.toISOString(),
            countryCode: log.countryCode,
            routeDirectionId: log.routeDirectionId,
            metadata: log.metadata || {},
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
    async getLogDetailById(logId) {
        try {
            const log = await this.prisma.decisionLog.findUnique({
                where: { id: logId },
                include: {
                    outcomes: true,
                },
            });
            if (!log) {
                return null;
            }
            return {
                id: log.id,
                tripId: log.tripId,
                countryCode: log.countryCode,
                routeDirectionId: log.routeDirectionId,
                persona: log.persona,
                action: log.action,
                decisionSource: log.decisionSource,
                decisionStage: log.decisionStage || 'FINALIZE',
                explanation: log.explanation,
                reasonCodes: log.reasonCodes,
                evidenceRefs: log.evidenceRefs,
                timestamp: log.timestamp.toISOString(),
                metadata: log.metadata || {},
                availableOptions: log.availableOptions,
                userChoice: log.userChoice,
                userReasoning: log.userReasoning,
                confidenceLevel: log.confidenceLevel,
                systemRecommendation: log.systemRecommendation,
                alignmentScore: log.alignmentScore,
                outcomes: log.outcomes || [],
            };
        }
        catch (error) {
            this.logger.error(`获取决策日志详情失败: ${error.message}`, error.stack);
            throw error;
        }
    }
    async queryRawLogs(filters) {
        const where = {};
        if (filters.tripId) {
            where.tripId = filters.tripId;
        }
        if (filters.persona) {
            where.persona = filters.persona;
        }
        if (filters.decisionSource) {
            where.decisionSource = filters.decisionSource;
        }
        if (filters.action) {
            where.action = filters.action;
        }
        if (filters.startDate || filters.endDate) {
            where.timestamp = {};
            if (filters.startDate) {
                where.timestamp.gte = filters.startDate;
            }
            if (filters.endDate) {
                where.timestamp.lte = filters.endDate;
            }
        }
        return await this.prisma.decisionLog.findMany({
            where,
            orderBy: { timestamp: 'desc' },
            take: filters.limit || 10000,
        });
    }
};
exports.DecisionLogStorageService = DecisionLogStorageService;
exports.DecisionLogStorageService = DecisionLogStorageService = DecisionLogStorageService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], DecisionLogStorageService);
//# sourceMappingURL=decision-log-storage.service.js.map