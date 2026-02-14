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
var TrainingMetricsService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingMetricsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let TrainingMetricsService = TrainingMetricsService_1 = class TrainingMetricsService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TrainingMetricsService_1.name);
    }
    async getCollectionStats(options = {}) {
        const where = {};
        if (options.startDate || options.endDate) {
            where.createdAt = {};
            if (options.startDate) {
                where.createdAt.gte = options.startDate;
            }
            if (options.endDate) {
                where.createdAt.lte = options.endDate;
            }
        }
        if (options.modelVersion) {
            where.modelVersion = options.modelVersion;
        }
        if (options.countryCode) {
            where.countryCode = options.countryCode;
        }
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where,
            select: {
                validationStatus: true,
                validationScore: true,
                totalReward: true,
                modelVersion: true,
                countryCode: true,
            },
        });
        const totalTrajectories = trajectories.length;
        const validatedCount = trajectories.filter((t) => t.validationStatus === 'VALIDATED').length;
        const rejectedCount = trajectories.filter((t) => t.validationStatus === 'REJECTED').length;
        const pendingCount = trajectories.filter((t) => t.validationStatus === 'PENDING').length;
        const validationRate = totalTrajectories > 0 ? validatedCount / totalTrajectories : 0;
        const scores = trajectories
            .map((t) => t.validationScore)
            .filter((s) => s !== null && s !== undefined);
        const avgValidationScore = scores.length > 0
            ? scores.reduce((sum, s) => sum + s, 0) / scores.length
            : 0;
        const rewards = trajectories
            .map((t) => t.totalReward)
            .filter((r) => r !== null && r !== undefined);
        const avgReward = rewards.length > 0
            ? rewards.reduce((sum, r) => sum + r, 0) / rewards.length
            : 0;
        const byModelVersion = {};
        for (const t of trajectories) {
            const version = t.modelVersion || 'unknown';
            byModelVersion[version] = (byModelVersion[version] || 0) + 1;
        }
        const byCountry = {};
        for (const t of trajectories) {
            const country = t.countryCode || 'unknown';
            byCountry[country] = (byCountry[country] || 0) + 1;
        }
        return {
            totalTrajectories,
            validatedCount,
            rejectedCount,
            pendingCount,
            validationRate,
            avgValidationScore,
            avgReward,
            byModelVersion,
            byCountry,
        };
    }
    async getTrainingDataQuality(options = {}) {
        const where = {
            validationStatus: 'VALIDATED',
        };
        if (options.minScore !== undefined) {
            where.validationScore = { gte: options.minScore };
        }
        if (options.minReward !== undefined) {
            where.totalReward = { gte: options.minReward };
        }
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where,
            select: {
                validationScore: true,
                totalReward: true,
            },
        });
        const eligibleCount = trajectories.length;
        const scores = trajectories.map((t) => t.validationScore);
        const avgScore = scores.length > 0
            ? scores.reduce((sum, s) => sum + s, 0) / scores.length
            : 0;
        const rewards = trajectories.map((t) => t.totalReward);
        const avgReward = rewards.length > 0
            ? rewards.reduce((sum, r) => sum + r, 0) / rewards.length
            : 0;
        const scoreDistribution = {
            '0.8-0.9': trajectories.filter((t) => t.validationScore >= 0.8 && t.validationScore < 0.9).length,
            '0.9-0.95': trajectories.filter((t) => t.validationScore >= 0.9 && t.validationScore < 0.95).length,
            '0.95-1.0': trajectories.filter((t) => t.validationScore >= 0.95 && t.validationScore <= 1.0).length,
        };
        const rewardDistribution = {
            '0-1': trajectories.filter((t) => t.totalReward >= 0 && t.totalReward < 1).length,
            '1-2': trajectories.filter((t) => t.totalReward >= 1 && t.totalReward < 2).length,
            '2+': trajectories.filter((t) => t.totalReward >= 2).length,
        };
        return {
            eligibleCount,
            avgScore,
            avgReward,
            scoreDistribution,
            rewardDistribution,
        };
    }
};
exports.TrainingMetricsService = TrainingMetricsService;
exports.TrainingMetricsService = TrainingMetricsService = TrainingMetricsService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TrainingMetricsService);
//# sourceMappingURL=training-metrics.service.js.map