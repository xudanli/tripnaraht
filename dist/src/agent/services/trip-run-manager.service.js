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
var TripRunManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TripRunManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../prisma/prisma.service");
let TripRunManagerService = TripRunManagerService_1 = class TripRunManagerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TripRunManagerService_1.name);
        if (!this.prisma) {
            this.logger.warn('PrismaService not available, TripRun recording will be disabled');
        }
    }
    async createTripRun(params) {
        if (!this.prisma) {
            this.logger.debug('PrismaService not available, skipping TripRun creation');
            return null;
        }
        try {
            if (params.tripId && !this.isValidUUID(params.tripId)) {
                this.logger.warn(`Invalid tripId format: ${params.tripId}, creating TripRun without tripId`);
                params.tripId = null;
            }
            if (params.userId && !this.isValidUUID(params.userId)) {
                this.logger.warn(`Invalid userId format: ${params.userId}, creating TripRun without userId`);
                params.userId = null;
            }
            const tripRun = await this.prisma.tripRun.create({
                data: {
                    tripId: params.tripId || null,
                    userId: params.userId || null,
                    userQuery: params.userQuery,
                    planningPhase: params.planningPhase || 'INITIAL',
                    currentAgent: params.currentAgent || null,
                    status: 'IN_PROGRESS',
                    metadata: params.metadata || {},
                },
            });
            this.logger.debug(`Created TripRun: ${tripRun.id} for tripId=${params.tripId || 'none'}, userId=${params.userId || 'none'}`);
            return tripRun.id;
        }
        catch (error) {
            this.logger.error(`Failed to create TripRun: ${error.message}`, error.stack);
            return null;
        }
    }
    async createTripAttempt(params) {
        if (!this.prisma) {
            this.logger.debug('PrismaService not available, skipping TripAttempt creation');
            return null;
        }
        try {
            if (!this.isValidUUID(params.tripRunId)) {
                this.logger.warn(`Invalid tripRunId format: ${params.tripRunId}`);
                return null;
            }
            const attempt = await this.prisma.tripAttempt.create({
                data: {
                    tripRunId: params.tripRunId,
                    attemptNumber: params.attemptNumber,
                    planOutline: params.planOutline || null,
                    openQuestions: params.openQuestions || [],
                    constraintsAssumed: params.constraintsAssumed || [],
                    nextActions: params.nextActions || [],
                    status: 'IN_PROGRESS',
                    metadata: params.metadata || {},
                },
            });
            this.logger.debug(`Created TripAttempt: ${attempt.id} for runId=${params.tripRunId}, attemptNumber=${params.attemptNumber}`);
            return attempt.id;
        }
        catch (error) {
            this.logger.error(`Failed to create TripAttempt: ${error.message}`, error.stack);
            return null;
        }
    }
    async updateTripRun(params) {
        if (!this.prisma) {
            this.logger.debug('PrismaService not available, skipping TripRun update');
            return false;
        }
        try {
            if (!this.isValidUUID(params.runId)) {
                this.logger.warn(`Invalid runId format: ${params.runId}`);
                return false;
            }
            const updateData = {};
            if (params.status) {
                updateData.status = params.status;
            }
            if (params.planningPhase) {
                updateData.planningPhase = params.planningPhase;
            }
            if (params.currentAgent !== undefined) {
                updateData.currentAgent = params.currentAgent;
            }
            if (params.completedAt) {
                updateData.completedAt = params.completedAt;
            }
            if (params.metadata) {
                const existing = await this.prisma.tripRun.findUnique({
                    where: { id: params.runId },
                    select: { metadata: true },
                });
                updateData.metadata = {
                    ...((existing === null || existing === void 0 ? void 0 : existing.metadata) || {}),
                    ...params.metadata,
                };
            }
            await this.prisma.tripRun.update({
                where: { id: params.runId },
                data: updateData,
            });
            this.logger.debug(`Updated TripRun: ${params.runId}, status=${params.status || 'unchanged'}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to update TripRun: ${error.message}`, error.stack);
            return false;
        }
    }
    async updateTripAttempt(params) {
        if (!this.prisma) {
            this.logger.debug('PrismaService not available, skipping TripAttempt update');
            return false;
        }
        try {
            if (!this.isValidUUID(params.attemptId)) {
                this.logger.warn(`Invalid attemptId format: ${params.attemptId}`);
                return false;
            }
            const updateData = {};
            if (params.status) {
                updateData.status = params.status;
            }
            if (params.planOutline !== undefined) {
                updateData.planOutline = params.planOutline;
            }
            if (params.openQuestions) {
                updateData.openQuestions = params.openQuestions;
            }
            if (params.constraintsAssumed) {
                updateData.constraintsAssumed = params.constraintsAssumed;
            }
            if (params.nextActions) {
                updateData.nextActions = params.nextActions;
            }
            if (params.failureNotes !== undefined) {
                updateData.failureNotes = params.failureNotes;
            }
            if (params.resultSummary !== undefined) {
                updateData.resultSummary = params.resultSummary;
            }
            if (params.artifacts) {
                updateData.artifacts = params.artifacts;
            }
            if (params.completedAt) {
                updateData.completedAt = params.completedAt;
            }
            if (params.metadata) {
                const existing = await this.prisma.tripAttempt.findUnique({
                    where: { id: params.attemptId },
                    select: { metadata: true },
                });
                updateData.metadata = {
                    ...((existing === null || existing === void 0 ? void 0 : existing.metadata) || {}),
                    ...params.metadata,
                };
            }
            await this.prisma.tripAttempt.update({
                where: { id: params.attemptId },
                data: updateData,
            });
            this.logger.debug(`Updated TripAttempt: ${params.attemptId}, status=${params.status || 'unchanged'}`);
            return true;
        }
        catch (error) {
            this.logger.error(`Failed to update TripAttempt: ${error.message}`, error.stack);
            return false;
        }
    }
    async completeTripRun(runId, metadata) {
        return this.updateTripRun({
            runId,
            status: 'COMPLETED',
            completedAt: new Date(),
            metadata,
        });
    }
    async failTripRun(runId, error, metadata) {
        const errorMessage = error instanceof Error ? error.message : error;
        return this.updateTripRun({
            runId,
            status: 'FAILED',
            completedAt: new Date(),
            metadata: {
                ...metadata,
                error: errorMessage,
                failedAt: new Date().toISOString(),
            },
        });
    }
    async completeTripAttempt(attemptId, resultSummary, artifacts, metadata) {
        return this.updateTripAttempt({
            attemptId,
            status: 'COMPLETED',
            resultSummary,
            artifacts,
            completedAt: new Date(),
            metadata,
        });
    }
    async failTripAttempt(attemptId, failureNotes, metadata) {
        return this.updateTripAttempt({
            attemptId,
            status: 'FAILED',
            failureNotes,
            completedAt: new Date(),
            metadata,
        });
    }
    isValidUUID(uuid) {
        if (!uuid || typeof uuid !== 'string') {
            return false;
        }
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return uuidRegex.test(uuid.trim());
    }
};
exports.TripRunManagerService = TripRunManagerService;
exports.TripRunManagerService = TripRunManagerService = TripRunManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TripRunManagerService);
//# sourceMappingURL=trip-run-manager.service.js.map