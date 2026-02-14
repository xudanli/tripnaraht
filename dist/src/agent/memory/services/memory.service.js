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
var MemoryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MemoryService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const user_travel_profile_interface_1 = require("../interfaces/user-travel-profile.interface");
let MemoryService = MemoryService_1 = class MemoryService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(MemoryService_1.name);
        this.userProfiles = new Map();
        this.decisionMemories = [];
        this.routeHealths = new Map();
        this.tripFeedbacks = [];
        this.useDatabase = !!prisma && prisma.isDbConnected();
        if (this.useDatabase) {
            this.logger.log('MemoryService: Using database storage');
        }
        else {
            this.logger.warn('MemoryService: Database not available, using in-memory storage. ' +
                'Data will be lost on service restart. ' +
                'To enable database storage, ensure DATABASE_URL is configured and the database is accessible. ' +
                'For development/testing without database, set ALLOW_NO_DATABASE=true.');
        }
    }
    async getUserTravelProfile(userId) {
        if (this.useDatabase && this.prisma) {
            try {
                const dbProfile = await this.prisma.userTravelProfile.findUnique({
                    where: { userId },
                });
                if (dbProfile) {
                    return {
                        userId: dbProfile.userId,
                        pacePreference: dbProfile.pacePreference,
                        altitudeTolerance: dbProfile.altitudeTolerance,
                        riskTolerance: dbProfile.riskTolerance,
                        travelPhilosophy: dbProfile.travelPhilosophy,
                        preferredRouteTypes: dbProfile.preferredRouteTypes,
                        confidence: dbProfile.confidence,
                        source: dbProfile.source,
                        updatedAt: dbProfile.updatedAt,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`Failed to read user profile from database: ${error}`);
            }
        }
        const profile = this.userProfiles.get(userId);
        if (profile) {
            return profile;
        }
        return (0, user_travel_profile_interface_1.createDefaultUserTravelProfile)(userId);
    }
    async saveUserTravelProfile(profile) {
        profile.updatedAt = new Date();
        if (this.useDatabase && this.prisma) {
            try {
                await this.prisma.userTravelProfile.upsert({
                    where: { userId: profile.userId },
                    create: {
                        userId: profile.userId,
                        pacePreference: profile.pacePreference,
                        altitudeTolerance: profile.altitudeTolerance,
                        riskTolerance: profile.riskTolerance,
                        travelPhilosophy: profile.travelPhilosophy,
                        preferredRouteTypes: profile.preferredRouteTypes || [],
                        confidence: profile.confidence,
                        source: profile.source,
                        updatedAt: profile.updatedAt,
                    },
                    update: {
                        pacePreference: profile.pacePreference,
                        altitudeTolerance: profile.altitudeTolerance,
                        riskTolerance: profile.riskTolerance,
                        travelPhilosophy: profile.travelPhilosophy,
                        preferredRouteTypes: profile.preferredRouteTypes || [],
                        confidence: profile.confidence,
                        source: profile.source,
                        updatedAt: profile.updatedAt,
                    },
                });
                this.logger.debug(`Saved user travel profile to database for user: ${profile.userId}`);
                return;
            }
            catch (error) {
                this.logger.warn(`Failed to save user profile to database: ${error}, falling back to memory`);
            }
        }
        this.userProfiles.set(profile.userId, profile);
        this.logger.debug(`Saved user travel profile to memory for user: ${profile.userId}`);
    }
    async updateUserTravelProfile(userId, updates) {
        const existing = await this.getUserTravelProfile(userId);
        if (!existing) {
            throw new Error(`User profile not found: ${userId}`);
        }
        const updated = {
            ...existing,
            ...updates,
            updatedAt: new Date(),
        };
        await this.saveUserTravelProfile(updated);
        return updated;
    }
    async saveRouteDirectionDecision(memory) {
        if (this.useDatabase && this.prisma) {
            try {
                await this.prisma.routeDirectionDecision.create({
                    data: {
                        id: memory.id,
                        userId: memory.userId,
                        tripId: memory.tripId,
                        countryCode: memory.countryCode,
                        month: memory.month,
                        selectedRouteDirectionId: memory.selectedRouteDirectionId,
                        rejectedRouteDirectionIds: memory.rejectedRouteDirectionIds,
                        keyConstraints: memory.keyConstraints,
                        scoreBreakdown: memory.scoreBreakdown,
                        explanation: memory.explanation,
                        createdAt: memory.createdAt,
                    },
                });
                this.logger.debug(`Saved route direction decision to database: ${memory.selectedRouteDirectionId} for user: ${memory.userId}`);
                return;
            }
            catch (error) {
                this.logger.warn(`Failed to save decision memory to database: ${error}, falling back to memory`);
            }
        }
        this.decisionMemories.push(memory);
        this.logger.debug(`Saved route direction decision to memory: ${memory.selectedRouteDirectionId} for user: ${memory.userId}`);
    }
    async getUserRouteDirectionDecisions(userId, countryCode) {
        if (this.useDatabase && this.prisma) {
            try {
                const where = { userId };
                if (countryCode) {
                    where.countryCode = countryCode;
                }
                const dbMemories = await this.prisma.routeDirectionDecision.findMany({
                    where,
                    orderBy: { createdAt: 'desc' },
                    take: 100,
                });
                return dbMemories.map(m => ({
                    id: m.id,
                    userId: m.userId,
                    tripId: m.tripId || undefined,
                    countryCode: m.countryCode,
                    month: m.month,
                    selectedRouteDirectionId: m.selectedRouteDirectionId,
                    rejectedRouteDirectionIds: m.rejectedRouteDirectionIds,
                    keyConstraints: m.keyConstraints,
                    scoreBreakdown: m.scoreBreakdown,
                    explanation: m.explanation,
                    createdAt: m.createdAt,
                }));
            }
            catch (error) {
                this.logger.warn(`Failed to query decision memories from database: ${error}, falling back to memory`);
            }
        }
        return this.decisionMemories.filter(m => {
            if (m.userId !== userId)
                return false;
            if (countryCode && m.countryCode !== countryCode)
                return false;
            return true;
        });
    }
    async getRouteDirectionHealth(routeDirectionId, countryCode) {
        if (this.useDatabase && this.prisma) {
            try {
                const dbHealth = await this.prisma.routeDirectionHealth.findUnique({
                    where: {
                        routeDirectionId_countryCode: {
                            routeDirectionId,
                            countryCode,
                        },
                    },
                });
                if (dbHealth) {
                    return {
                        routeDirectionId: dbHealth.routeDirectionId,
                        countryCode: dbHealth.countryCode,
                        totalRuns: dbHealth.totalRuns,
                        successRuns: dbHealth.successRuns,
                        failureRuns: dbHealth.failureRuns,
                        commonFailureReasons: dbHealth.commonFailureReasons,
                        commonRepairs: dbHealth.commonRepairs,
                        lastUpdated: dbHealth.lastUpdated,
                    };
                }
            }
            catch (error) {
                this.logger.warn(`Failed to read route health from database: ${error}`);
            }
        }
        const key = `${routeDirectionId}_${countryCode}`;
        return this.routeHealths.get(key) || null;
    }
    async updateRouteDirectionHealth(routeDirectionId, countryCode, success, failureReason, repair) {
        if (this.useDatabase && this.prisma) {
            try {
                const existing = await this.prisma.routeDirectionHealth.findUnique({
                    where: {
                        routeDirectionId_countryCode: {
                            routeDirectionId,
                            countryCode,
                        },
                    },
                });
                const currentTotalRuns = (existing === null || existing === void 0 ? void 0 : existing.totalRuns) || 0;
                const currentSuccessRuns = (existing === null || existing === void 0 ? void 0 : existing.successRuns) || 0;
                const currentFailureRuns = (existing === null || existing === void 0 ? void 0 : existing.failureRuns) || 0;
                const currentFailureReasons = (existing === null || existing === void 0 ? void 0 : existing.commonFailureReasons) || [];
                const currentRepairs = (existing === null || existing === void 0 ? void 0 : existing.commonRepairs) || [];
                const newFailureReasons = failureReason && !currentFailureReasons.includes(failureReason)
                    ? [...currentFailureReasons, failureReason]
                    : currentFailureReasons;
                const newRepairs = repair && !currentRepairs.includes(repair)
                    ? [...currentRepairs, repair]
                    : currentRepairs;
                const updated = await this.prisma.routeDirectionHealth.upsert({
                    where: {
                        routeDirectionId_countryCode: {
                            routeDirectionId,
                            countryCode,
                        },
                    },
                    create: {
                        routeDirectionId,
                        countryCode,
                        totalRuns: 1,
                        successRuns: success ? 1 : 0,
                        failureRuns: success ? 0 : 1,
                        commonFailureReasons: newFailureReasons,
                        commonRepairs: newRepairs,
                        lastUpdated: new Date(),
                    },
                    update: {
                        totalRuns: currentTotalRuns + 1,
                        successRuns: success ? currentSuccessRuns + 1 : currentSuccessRuns,
                        failureRuns: success ? currentFailureRuns : currentFailureRuns + 1,
                        commonFailureReasons: newFailureReasons,
                        commonRepairs: newRepairs,
                        lastUpdated: new Date(),
                    },
                });
                this.logger.debug(`Updated route direction health in database: ${routeDirectionId} (${countryCode}) - ` +
                    `success: ${success}, total: ${updated.totalRuns}`);
                return {
                    routeDirectionId: updated.routeDirectionId,
                    countryCode: updated.countryCode,
                    totalRuns: updated.totalRuns,
                    successRuns: updated.successRuns,
                    failureRuns: updated.failureRuns,
                    commonFailureReasons: updated.commonFailureReasons,
                    commonRepairs: updated.commonRepairs,
                    lastUpdated: updated.lastUpdated,
                };
            }
            catch (error) {
                this.logger.warn(`Failed to update route health in database: ${error}, falling back to memory`);
            }
        }
        const key = `${routeDirectionId}_${countryCode}`;
        const existing = this.routeHealths.get(key);
        const health = existing || {
            routeDirectionId,
            countryCode,
            totalRuns: 0,
            successRuns: 0,
            failureRuns: 0,
            commonFailureReasons: [],
            commonRepairs: [],
            lastUpdated: new Date(),
        };
        health.totalRuns += 1;
        if (success) {
            health.successRuns += 1;
        }
        else {
            health.failureRuns += 1;
            if (failureReason && !health.commonFailureReasons.includes(failureReason)) {
                health.commonFailureReasons.push(failureReason);
            }
        }
        if (repair && !health.commonRepairs.includes(repair)) {
            health.commonRepairs.push(repair);
        }
        health.lastUpdated = new Date();
        this.routeHealths.set(key, health);
        this.logger.debug(`Updated route direction health in memory: ${routeDirectionId} (${countryCode}) - ` +
            `success: ${success}, total: ${health.totalRuns}`);
        return health;
    }
    async saveTripOutcomeFeedback(feedback) {
        if (this.useDatabase && this.prisma) {
            try {
                await this.prisma.tripOutcomeFeedback.upsert({
                    where: { tripId: feedback.tripId },
                    create: {
                        tripId: feedback.tripId,
                        userId: feedback.userId,
                        overallSuccess: feedback.overallSuccess,
                        fatigueLevel: feedback.fatigueLevel,
                        satisfaction: feedback.satisfaction,
                        abandoned: feedback.abandoned,
                        failurePoints: feedback.failurePoints,
                        notes: feedback.notes,
                        createdAt: feedback.createdAt,
                    },
                    update: {
                        overallSuccess: feedback.overallSuccess,
                        fatigueLevel: feedback.fatigueLevel,
                        satisfaction: feedback.satisfaction,
                        abandoned: feedback.abandoned,
                        failurePoints: feedback.failurePoints,
                        notes: feedback.notes,
                    },
                });
                this.logger.debug(`Saved trip outcome feedback to database for trip: ${feedback.tripId}`);
            }
            catch (error) {
                this.logger.warn(`Failed to save feedback to database: ${error}, falling back to memory`);
            }
        }
        this.tripFeedbacks.push(feedback);
        this.logger.debug(`Saved trip outcome feedback to memory for trip: ${feedback.tripId}`);
        await this.learnFromFeedback(feedback);
    }
    async learnFromFeedback(feedback) {
        const profile = await this.getUserTravelProfile(feedback.userId);
        if (profile) {
            if (feedback.fatigueLevel && feedback.fatigueLevel >= 4) {
                if (profile.pacePreference === 'FAST') {
                    await this.updateUserTravelProfile(feedback.userId, {
                        pacePreference: 'MODERATE',
                        confidence: Math.min(1.0, profile.confidence + 0.05),
                    });
                }
                else if (profile.pacePreference === 'MODERATE') {
                    await this.updateUserTravelProfile(feedback.userId, {
                        pacePreference: 'SLOW',
                        confidence: Math.min(1.0, profile.confidence + 0.05),
                    });
                }
            }
            if (feedback.overallSuccess && feedback.satisfaction && feedback.satisfaction >= 4) {
                await this.updateUserTravelProfile(feedback.userId, {
                    confidence: Math.min(1.0, profile.confidence + 0.05),
                });
            }
        }
    }
    async getUserTripFeedbacks(userId) {
        if (this.useDatabase && this.prisma) {
            try {
                const dbFeedbacks = await this.prisma.tripOutcomeFeedback.findMany({
                    where: { userId },
                    orderBy: { createdAt: 'desc' },
                    take: 100,
                });
                return dbFeedbacks.map(f => ({
                    tripId: f.tripId,
                    userId: f.userId,
                    overallSuccess: f.overallSuccess,
                    fatigueLevel: f.fatigueLevel || undefined,
                    satisfaction: f.satisfaction || undefined,
                    abandoned: f.abandoned,
                    failurePoints: f.failurePoints,
                    notes: f.notes || undefined,
                    createdAt: f.createdAt,
                }));
            }
            catch (error) {
                this.logger.warn(`Failed to query feedbacks from database: ${error}, falling back to memory`);
            }
        }
        return this.tripFeedbacks.filter(f => f.userId === userId);
    }
};
exports.MemoryService = MemoryService;
exports.MemoryService = MemoryService = MemoryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], MemoryService);
//# sourceMappingURL=memory.service.js.map