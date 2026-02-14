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
var TrainingQualityAnalyzerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.TrainingQualityAnalyzerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let TrainingQualityAnalyzerService = TrainingQualityAnalyzerService_1 = class TrainingQualityAnalyzerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(TrainingQualityAnalyzerService_1.name);
    }
    async analyzeQuality(options = {}) {
        this.logger.log(`[QualityAnalyzer] 分析训练数据质量`);
        const where = {
            validationStatus: 'VALIDATED',
        };
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
        if (options.minScore !== undefined) {
            where.validationScore = { gte: options.minScore };
        }
        if (options.minReward !== undefined) {
            where.totalReward = { gte: options.minReward };
        }
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where,
            select: {
                trajectoryId: true,
                validationScore: true,
                totalReward: true,
                modelVersion: true,
                countryCode: true,
                createdAt: true,
                usedForTrainingCount: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        const distribution = this.analyzeDistribution(trajectories);
        const trends = this.analyzeTrends(trajectories);
        const anomalies = this.detectAnomalies(trajectories);
        const summary = this.generateSummary(trajectories, distribution, trends);
        return {
            summary,
            distribution,
            trends,
            anomalies,
            timestamp: new Date(),
        };
    }
    analyzeDistribution(trajectories) {
        const scores = trajectories.map((t) => t.validationScore);
        const rewards = trajectories.map((t) => t.totalReward);
        const scoreDistribution = {
            '0.8-0.85': trajectories.filter((t) => t.validationScore >= 0.8 && t.validationScore < 0.85).length,
            '0.85-0.9': trajectories.filter((t) => t.validationScore >= 0.85 && t.validationScore < 0.9).length,
            '0.9-0.95': trajectories.filter((t) => t.validationScore >= 0.9 && t.validationScore < 0.95).length,
            '0.95-1.0': trajectories.filter((t) => t.validationScore >= 0.95 && t.validationScore <= 1.0).length,
        };
        const rewardDistribution = {
            '0-0.5': trajectories.filter((t) => t.totalReward >= 0 && t.totalReward < 0.5).length,
            '0.5-1.0': trajectories.filter((t) => t.totalReward >= 0.5 && t.totalReward < 1.0).length,
            '1.0-2.0': trajectories.filter((t) => t.totalReward >= 1.0 && t.totalReward < 2.0).length,
            '2.0+': trajectories.filter((t) => t.totalReward >= 2.0).length,
        };
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
        const byWeek = {};
        for (const t of trajectories) {
            const week = this.getWeekKey(t.createdAt);
            byWeek[week] = (byWeek[week] || 0) + 1;
        }
        return {
            score: {
                mean: this.calculateMean(scores),
                median: this.calculateMedian(scores),
                stdDev: this.calculateStdDev(scores),
                min: Math.min(...scores),
                max: Math.max(...scores),
                distribution: scoreDistribution,
            },
            reward: {
                mean: this.calculateMean(rewards),
                median: this.calculateMedian(rewards),
                stdDev: this.calculateStdDev(rewards),
                min: Math.min(...rewards),
                max: Math.max(...rewards),
                distribution: rewardDistribution,
            },
            byModelVersion,
            byCountry,
            byWeek,
        };
    }
    analyzeTrends(trajectories) {
        if (trajectories.length < 10) {
            return {
                scoreTrend: 'INSUFFICIENT_DATA',
                rewardTrend: 'INSUFFICIENT_DATA',
                dataPoints: [],
            };
        }
        const weeklyData = {};
        for (const t of trajectories) {
            const week = this.getWeekKey(t.createdAt);
            if (!weeklyData[week]) {
                weeklyData[week] = { scores: [], rewards: [] };
            }
            weeklyData[week].scores.push(t.validationScore);
            weeklyData[week].rewards.push(t.totalReward);
        }
        const dataPoints = Object.keys(weeklyData)
            .sort()
            .map((week) => ({
            week,
            avgScore: this.calculateMean(weeklyData[week].scores),
            avgReward: this.calculateMean(weeklyData[week].rewards),
            count: weeklyData[week].scores.length,
        }));
        const scoreTrend = this.calculateTrend(dataPoints.map((d) => d.avgScore));
        const rewardTrend = this.calculateTrend(dataPoints.map((d) => d.avgReward));
        return {
            scoreTrend,
            rewardTrend,
            dataPoints,
        };
    }
    detectAnomalies(trajectories) {
        const scores = trajectories.map((t) => t.validationScore);
        const rewards = trajectories.map((t) => t.totalReward);
        const scoreMean = this.calculateMean(scores);
        const scoreStdDev = this.calculateStdDev(scores);
        const rewardMean = this.calculateMean(rewards);
        const rewardStdDev = this.calculateStdDev(rewards);
        const scoreThreshold = 3 * scoreStdDev;
        const rewardThreshold = 3 * rewardStdDev;
        const scoreOutliers = [];
        const rewardOutliers = [];
        for (const t of trajectories) {
            if (Math.abs(t.validationScore - scoreMean) > scoreThreshold) {
                scoreOutliers.push(t.trajectoryId);
            }
            if (Math.abs(t.totalReward - rewardMean) > rewardThreshold) {
                rewardOutliers.push(t.trajectoryId);
            }
        }
        return {
            scoreOutliers: {
                count: scoreOutliers.length,
                percentage: (scoreOutliers.length / trajectories.length) * 100,
                trajectoryIds: scoreOutliers.slice(0, 10),
            },
            rewardOutliers: {
                count: rewardOutliers.length,
                percentage: (rewardOutliers.length / trajectories.length) * 100,
                trajectoryIds: rewardOutliers.slice(0, 10),
            },
        };
    }
    generateSummary(trajectories, distribution, trends) {
        const totalCount = trajectories.length;
        const highQualityCount = trajectories.filter((t) => t.validationScore >= 0.9 && t.totalReward >= 1.0).length;
        return {
            totalTrajectories: totalCount,
            highQualityCount,
            highQualityPercentage: (highQualityCount / totalCount) * 100,
            avgScore: distribution.score.mean,
            avgReward: distribution.reward.mean,
            scoreTrend: trends.scoreTrend,
            rewardTrend: trends.rewardTrend,
            qualityGrade: this.calculateQualityGrade(distribution.score.mean, distribution.reward.mean, highQualityCount / totalCount),
        };
    }
    calculateQualityGrade(avgScore, avgReward, highQualityRatio) {
        let grade = 0;
        if (avgScore >= 0.9)
            grade += 2;
        else if (avgScore >= 0.85)
            grade += 1;
        if (avgReward >= 1.5)
            grade += 2;
        else if (avgReward >= 1.0)
            grade += 1;
        if (highQualityRatio >= 0.5)
            grade += 2;
        else if (highQualityRatio >= 0.3)
            grade += 1;
        if (grade >= 5)
            return 'A';
        if (grade >= 3)
            return 'B';
        if (grade >= 1)
            return 'C';
        return 'D';
    }
    calculateTrend(values) {
        if (values.length < 3) {
            return 'INSUFFICIENT_DATA';
        }
        const n = values.length;
        const x = Array.from({ length: n }, (_, i) => i);
        const y = values;
        const sumX = x.reduce((sum, v) => sum + v, 0);
        const sumY = y.reduce((sum, v) => sum + v, 0);
        const sumXY = x.reduce((sum, v, i) => sum + v * y[i], 0);
        const sumXX = x.reduce((sum, v) => sum + v * v, 0);
        const slope = (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX);
        if (slope > 0.01) {
            return 'INCREASING';
        }
        else if (slope < -0.01) {
            return 'DECREASING';
        }
        else {
            return 'STABLE';
        }
    }
    getWeekKey(date) {
        const year = date.getFullYear();
        const startOfYear = new Date(year, 0, 1);
        const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        const week = Math.floor(days / 7) + 1;
        return `${year}-W${week.toString().padStart(2, '0')}`;
    }
    calculateMean(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }
    calculateMedian(values) {
        if (values.length === 0)
            return 0;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return sorted.length % 2 === 0
            ? (sorted[mid - 1] + sorted[mid]) / 2
            : sorted[mid];
    }
    calculateStdDev(values) {
        if (values.length === 0)
            return 0;
        const mean = this.calculateMean(values);
        const variance = values.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
            values.length;
        return Math.sqrt(variance);
    }
};
exports.TrainingQualityAnalyzerService = TrainingQualityAnalyzerService;
exports.TrainingQualityAnalyzerService = TrainingQualityAnalyzerService = TrainingQualityAnalyzerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], TrainingQualityAnalyzerService);
//# sourceMappingURL=training-quality-analyzer.service.js.map