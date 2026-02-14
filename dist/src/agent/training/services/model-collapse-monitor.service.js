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
var ModelCollapseMonitorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelCollapseMonitorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let ModelCollapseMonitorService = ModelCollapseMonitorService_1 = class ModelCollapseMonitorService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ModelCollapseMonitorService_1.name);
    }
    async detectCollapseRisk(options = {}) {
        const { modelVersion, lookbackDays = 30, minTrajectories = 100, } = options;
        this.logger.log(`[ModelCollapseMonitor] 检测 Model Collapse 风险: modelVersion=${modelVersion}, lookbackDays=${lookbackDays}`);
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - lookbackDays);
        const where = {
            createdAt: {
                gte: startDate,
                lte: endDate,
            },
            validationStatus: 'VALIDATED',
        };
        if (modelVersion) {
            where.modelVersion = modelVersion;
        }
        const trajectories = await this.prisma.validatedTrajectory.findMany({
            where,
            select: {
                trajectoryId: true,
                validationScore: true,
                totalReward: true,
                modelVersion: true,
                createdAt: true,
                plan: true,
                decisionTrace: true,
            },
            orderBy: {
                createdAt: 'asc',
            },
        });
        if (trajectories.length < minTrajectories) {
            this.logger.warn(`[ModelCollapseMonitor] 轨迹数量不足: ${trajectories.length} < ${minTrajectories}`);
            return {
                riskLevel: 'LOW',
                riskScore: 0,
                indicators: {
                    performanceTrend: 'INSUFFICIENT_DATA',
                    diversityTrend: 'INSUFFICIENT_DATA',
                    distributionShift: 'INSUFFICIENT_DATA',
                },
                metrics: {
                    trajectoryCount: trajectories.length,
                    avgScore: 0,
                    avgReward: 0,
                    diversityScore: 0,
                },
                recommendations: [
                    '需要更多轨迹数据才能进行准确的 Model Collapse 检测',
                ],
                timestamp: new Date(),
            };
        }
        const performanceTrend = this.analyzePerformanceTrend(trajectories);
        const diversityScore = this.calculateDiversityScore(trajectories);
        const diversityTrend = this.analyzeDiversityTrend(trajectories);
        const distributionShift = this.detectDistributionShift(trajectories);
        const riskScore = this.calculateRiskScore(performanceTrend, diversityTrend, distributionShift);
        const riskLevel = this.determineRiskLevel(riskScore);
        const recommendations = this.generateRecommendations(riskLevel, performanceTrend, diversityTrend, distributionShift);
        return {
            riskLevel,
            riskScore,
            indicators: {
                performanceTrend,
                diversityTrend,
                distributionShift,
            },
            metrics: {
                trajectoryCount: trajectories.length,
                avgScore: this.calculateAverage(trajectories.map((t) => t.validationScore)),
                avgReward: this.calculateAverage(trajectories.map((t) => t.totalReward)),
                diversityScore,
            },
            recommendations,
            timestamp: new Date(),
        };
    }
    analyzePerformanceTrend(trajectories) {
        if (trajectories.length < 20) {
            return 'INSUFFICIENT_DATA';
        }
        const midPoint = Math.floor(trajectories.length / 2);
        const firstHalf = trajectories.slice(0, midPoint);
        const secondHalf = trajectories.slice(midPoint);
        const firstHalfAvgScore = this.calculateAverage(firstHalf.map((t) => t.validationScore));
        const secondHalfAvgScore = this.calculateAverage(secondHalf.map((t) => t.validationScore));
        const firstHalfAvgReward = this.calculateAverage(firstHalf.map((t) => t.totalReward));
        const secondHalfAvgReward = this.calculateAverage(secondHalf.map((t) => t.totalReward));
        const scoreChange = secondHalfAvgScore - firstHalfAvgScore;
        const rewardChange = secondHalfAvgReward - firstHalfAvgReward;
        if (scoreChange < -0.05 && rewardChange < -0.1) {
            return 'DECLINING';
        }
        if (scoreChange > 0.05 && rewardChange > 0.1) {
            return 'IMPROVING';
        }
        return 'STABLE';
    }
    calculateDiversityScore(trajectories) {
        if (trajectories.length < 2) {
            return 1.0;
        }
        const similarities = [];
        for (let i = 0; i < Math.min(trajectories.length, 100); i++) {
            for (let j = i + 1; j < Math.min(trajectories.length, 100); j++) {
                const similarity = this.calculateTrajectorySimilarity(trajectories[i], trajectories[j]);
                similarities.push(similarity);
            }
        }
        if (similarities.length === 0) {
            return 1.0;
        }
        const avgSimilarity = similarities.reduce((sum, s) => sum + s, 0) / similarities.length;
        return Math.max(0, 1 - avgSimilarity);
    }
    calculateTrajectorySimilarity(t1, t2) {
        const trace1 = Array.isArray(t1.decisionTrace) ? t1.decisionTrace : [];
        const trace2 = Array.isArray(t2.decisionTrace) ? t2.decisionTrace : [];
        const len1 = trace1.length;
        const len2 = trace2.length;
        const lengthSimilarity = 1 - Math.abs(len1 - len2) / Math.max(len1, len2, 1);
        const stepSimilarity = len1 === len2 ? 0.5 : 0;
        return (lengthSimilarity + stepSimilarity) / 2;
    }
    analyzeDiversityTrend(trajectories) {
        if (trajectories.length < 20) {
            return 'INSUFFICIENT_DATA';
        }
        const midPoint = Math.floor(trajectories.length / 2);
        const firstHalf = trajectories.slice(0, midPoint);
        const secondHalf = trajectories.slice(midPoint);
        const firstHalfDiversity = this.calculateDiversityScore(firstHalf);
        const secondHalfDiversity = this.calculateDiversityScore(secondHalf);
        const diversityChange = secondHalfDiversity - firstHalfDiversity;
        if (diversityChange < -0.1) {
            return 'DECLINING';
        }
        if (diversityChange > 0.1) {
            return 'IMPROVING';
        }
        return 'STABLE';
    }
    detectDistributionShift(trajectories) {
        if (trajectories.length < 20) {
            return 'INSUFFICIENT_DATA';
        }
        const midPoint = Math.floor(trajectories.length / 2);
        const firstHalf = trajectories.slice(0, midPoint);
        const secondHalf = trajectories.slice(midPoint);
        const firstHalfScores = firstHalf.map((t) => t.validationScore);
        const secondHalfScores = secondHalf.map((t) => t.validationScore);
        const firstHalfStd = this.calculateStdDev(firstHalfScores);
        const secondHalfStd = this.calculateStdDev(secondHalfScores);
        const stdChange = Math.abs(secondHalfStd - firstHalfStd) / firstHalfStd;
        if (stdChange > 0.2) {
            return 'SHIFT_DETECTED';
        }
        return 'STABLE';
    }
    calculateRiskScore(performanceTrend, diversityTrend, distributionShift) {
        let riskScore = 0;
        if (performanceTrend === 'DECLINING') {
            riskScore += 0.4;
        }
        else if (performanceTrend === 'STABLE') {
            riskScore += 0.1;
        }
        if (diversityTrend === 'DECLINING') {
            riskScore += 0.3;
        }
        else if (diversityTrend === 'STABLE') {
            riskScore += 0.1;
        }
        if (distributionShift === 'SHIFT_DETECTED') {
            riskScore += 0.3;
        }
        else if (distributionShift === 'STABLE') {
            riskScore += 0.1;
        }
        return Math.min(1, riskScore);
    }
    determineRiskLevel(riskScore) {
        if (riskScore < 0.3) {
            return 'LOW';
        }
        else if (riskScore < 0.6) {
            return 'MEDIUM';
        }
        else {
            return 'HIGH';
        }
    }
    generateRecommendations(riskLevel, performanceTrend, diversityTrend, distributionShift) {
        const recommendations = [];
        if (riskLevel === 'HIGH') {
            recommendations.push('⚠️ Model Collapse 风险较高，建议暂停训练并检查数据质量');
        }
        else if (riskLevel === 'MEDIUM') {
            recommendations.push('⚠️ Model Collapse 风险中等，建议增加数据多样性');
        }
        if (performanceTrend === 'DECLINING') {
            recommendations.push('📉 检测到性能下降趋势，建议检查筛选标准和 reward 信号');
        }
        if (diversityTrend === 'DECLINING') {
            recommendations.push('🔄 检测到轨迹多样性下降，建议增加数据来源多样性');
        }
        if (distributionShift === 'SHIFT_DETECTED') {
            recommendations.push('📊 检测到数据分布变化，建议检查数据收集流程');
        }
        if (recommendations.length === 0) {
            recommendations.push('✅ 当前未检测到 Model Collapse 风险');
        }
        return recommendations;
    }
    calculateAverage(values) {
        if (values.length === 0)
            return 0;
        return values.reduce((sum, v) => sum + v, 0) / values.length;
    }
    calculateStdDev(values) {
        if (values.length === 0)
            return 0;
        const avg = this.calculateAverage(values);
        const variance = values.reduce((sum, v) => sum + Math.pow(v - avg, 2), 0) /
            values.length;
        return Math.sqrt(variance);
    }
};
exports.ModelCollapseMonitorService = ModelCollapseMonitorService;
exports.ModelCollapseMonitorService = ModelCollapseMonitorService = ModelCollapseMonitorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ModelCollapseMonitorService);
//# sourceMappingURL=model-collapse-monitor.service.js.map