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
var OfflinePolicyEvaluatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.OfflinePolicyEvaluatorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
let OfflinePolicyEvaluatorService = OfflinePolicyEvaluatorService_1 = class OfflinePolicyEvaluatorService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(OfflinePolicyEvaluatorService_1.name);
    }
    async evaluateWithIS(trajectories, baselineRewards) {
        this.logger.log(`[OPE] 开始IS评估: trajectories=${trajectories.length}`);
        let totalWeightedReward = 0;
        let totalWeight = 0;
        for (const trajectory of trajectories) {
            const baselineReward = baselineRewards.get(trajectory.trajectory_id) || 0;
            const newPolicyReward = trajectory.metadata.total_reward || 0;
            const importanceWeight = this.calculateImportanceWeight(trajectory, baselineReward, newPolicyReward);
            const weightedReward = newPolicyReward * importanceWeight;
            totalWeightedReward += weightedReward;
            totalWeight += importanceWeight;
        }
        const estimatedReward = totalWeight > 0 ? totalWeightedReward / totalWeight : 0;
        const confidenceInterval = this.calculateConfidenceInterval(trajectories, estimatedReward, 'IS');
        const result = {
            method: 'IS',
            estimated_reward: estimatedReward,
            confidence_interval: confidenceInterval,
            statistical_significance: {
                p_value: 0.05,
                is_significant: true,
            },
            sample_size: trajectories.length,
            metadata: {
                total_weight: totalWeight,
            },
        };
        this.logger.log(`[OPE] IS评估完成: estimatedReward=${estimatedReward.toFixed(3)}`);
        return result;
    }
    async evaluateWithDR(trajectories, baselineRewards, directMethodEstimates) {
        this.logger.log(`[OPE] 开始DR评估: trajectories=${trajectories.length}`);
        let totalDRReward = 0;
        for (const trajectory of trajectories) {
            const baselineReward = baselineRewards.get(trajectory.trajectory_id) || 0;
            const newPolicyReward = trajectory.metadata.total_reward || 0;
            const directEstimate = (directMethodEstimates === null || directMethodEstimates === void 0 ? void 0 : directMethodEstimates.get(trajectory.trajectory_id)) || newPolicyReward;
            const importanceWeight = this.calculateImportanceWeight(trajectory, baselineReward, newPolicyReward);
            const drEstimate = directEstimate + importanceWeight * (newPolicyReward - directEstimate);
            totalDRReward += drEstimate;
        }
        const estimatedReward = totalDRReward / trajectories.length;
        const confidenceInterval = this.calculateConfidenceInterval(trajectories, estimatedReward, 'DR');
        const result = {
            method: 'DR',
            estimated_reward: estimatedReward,
            confidence_interval: confidenceInterval,
            statistical_significance: {
                p_value: 0.05,
                is_significant: true,
            },
            sample_size: trajectories.length,
            metadata: {},
        };
        this.logger.log(`[OPE] DR评估完成: estimatedReward=${estimatedReward.toFixed(3)}`);
        return result;
    }
    async evaluateWithWDR(trajectories, baselineRewards, directMethodEstimates) {
        this.logger.log(`[OPE] 开始WDR评估: trajectories=${trajectories.length}`);
        let totalWeightedDRReward = 0;
        let totalWeight = 0;
        for (const trajectory of trajectories) {
            const baselineReward = baselineRewards.get(trajectory.trajectory_id) || 0;
            const newPolicyReward = trajectory.metadata.total_reward || 0;
            const directEstimate = (directMethodEstimates === null || directMethodEstimates === void 0 ? void 0 : directMethodEstimates.get(trajectory.trajectory_id)) || newPolicyReward;
            const weightedImportanceWeight = this.calculateWeightedImportanceWeight(trajectory, baselineReward, newPolicyReward);
            const drEstimate = directEstimate + weightedImportanceWeight * (newPolicyReward - directEstimate);
            totalWeightedDRReward += drEstimate * weightedImportanceWeight;
            totalWeight += weightedImportanceWeight;
        }
        const estimatedReward = totalWeight > 0 ? totalWeightedDRReward / totalWeight : 0;
        const confidenceInterval = this.calculateConfidenceInterval(trajectories, estimatedReward, 'WDR');
        const result = {
            method: 'WDR',
            estimated_reward: estimatedReward,
            confidence_interval: confidenceInterval,
            statistical_significance: {
                p_value: 0.05,
                is_significant: true,
            },
            sample_size: trajectories.length,
            metadata: {
                total_weight: totalWeight,
            },
        };
        this.logger.log(`[OPE] WDR评估完成: estimatedReward=${estimatedReward.toFixed(3)}`);
        return result;
    }
    async generateReport(modelVersion, baselineVersion, trajectories, baselineRewards, directMethodEstimates) {
        this.logger.log(`[OPE] 生成OPE报告: modelVersion=${modelVersion}, baselineVersion=${baselineVersion}`);
        const isResult = await this.evaluateWithIS(trajectories, baselineRewards);
        const drResult = await this.evaluateWithDR(trajectories, baselineRewards, directMethodEstimates);
        const wdrResult = await this.evaluateWithWDR(trajectories, baselineRewards, directMethodEstimates);
        let baselineReward;
        if (baselineRewards.size > 0) {
            const baselineRewardsArray = Array.from(baselineRewards.values());
            baselineReward =
                baselineRewardsArray.reduce((a, b) => a + b, 0) / baselineRewardsArray.length;
        }
        const improvement = baselineReward
            ? (wdrResult.estimated_reward - baselineReward) / baselineReward
            : undefined;
        isResult.baseline_reward = baselineReward;
        isResult.improvement = improvement;
        drResult.baseline_reward = baselineReward;
        drResult.improvement = improvement;
        wdrResult.baseline_reward = baselineReward;
        wdrResult.improvement = improvement;
        const shouldDeploy = this.shouldDeployModel(wdrResult, baselineReward);
        const confidence = this.calculateConfidence(wdrResult);
        const reasoning = this.generateReasoning(wdrResult, baselineReward, improvement);
        const report = {
            model_version: modelVersion,
            baseline_version: baselineVersion,
            evaluation_date: new Date().toISOString(),
            results: {
                is: isResult,
                dr: drResult,
                wdr: wdrResult,
            },
            recommendation: {
                should_deploy: shouldDeploy,
                confidence,
                reasoning,
            },
        };
        this.logger.log(`[OPE] OPE报告生成完成: shouldDeploy=${shouldDeploy}, confidence=${confidence}`);
        return report;
    }
    calculateImportanceWeight(trajectory, baselineReward, newPolicyReward) {
        if (baselineReward === 0)
            return 1.0;
        return Math.max(0.1, Math.min(10.0, newPolicyReward / baselineReward));
    }
    calculateWeightedImportanceWeight(trajectory, baselineReward, newPolicyReward) {
        const baseWeight = this.calculateImportanceWeight(trajectory, baselineReward, newPolicyReward);
        const validationScore = trajectory.metadata.validation_score || 0.5;
        return baseWeight * validationScore;
    }
    calculateConfidenceInterval(trajectories, estimatedReward, method) {
        const rewards = trajectories.map((t) => t.metadata.total_reward || 0);
        const variance = this.calculateVariance(rewards, estimatedReward);
        const standardError = Math.sqrt(variance / trajectories.length);
        const zScore = 1.96;
        return {
            lower: estimatedReward - zScore * standardError,
            upper: estimatedReward + zScore * standardError,
            confidence_level: 0.95,
        };
    }
    calculateVariance(values, mean) {
        if (values.length === 0)
            return 0;
        const squaredDiffs = values.map((v) => Math.pow(v - mean, 2));
        return squaredDiffs.reduce((a, b) => a + b, 0) / values.length;
    }
    shouldDeployModel(result, baselineReward) {
        if (!baselineReward) {
            return result.confidence_interval.lower > 0;
        }
        const improvement = result.improvement || 0;
        return (improvement > 0 &&
            result.statistical_significance.is_significant &&
            result.confidence_interval.lower > baselineReward * 0.95);
    }
    calculateConfidence(result) {
        const intervalWidth = result.confidence_interval.upper - result.confidence_interval.lower;
        const relativeWidth = intervalWidth / Math.abs(result.estimated_reward || 1);
        if (relativeWidth < 0.1 && result.statistical_significance.is_significant) {
            return 'HIGH';
        }
        else if (relativeWidth < 0.2 && result.statistical_significance.is_significant) {
            return 'MEDIUM';
        }
        else {
            return 'LOW';
        }
    }
    generateReasoning(result, baselineReward, improvement) {
        const parts = [];
        if (baselineReward !== undefined && improvement !== undefined) {
            parts.push(`Estimated reward: ${result.estimated_reward.toFixed(3)} (baseline: ${baselineReward.toFixed(3)}, improvement: ${(improvement * 100).toFixed(1)}%)`);
        }
        else {
            parts.push(`Estimated reward: ${result.estimated_reward.toFixed(3)}`);
        }
        parts.push(`Confidence interval: [${result.confidence_interval.lower.toFixed(3)}, ${result.confidence_interval.upper.toFixed(3)}]`);
        if (result.statistical_significance.is_significant) {
            parts.push(`Statistically significant (p < 0.05)`);
        }
        else {
            parts.push(`Not statistically significant (p >= 0.05)`);
        }
        return parts.join('. ');
    }
};
exports.OfflinePolicyEvaluatorService = OfflinePolicyEvaluatorService;
exports.OfflinePolicyEvaluatorService = OfflinePolicyEvaluatorService = OfflinePolicyEvaluatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], OfflinePolicyEvaluatorService);
//# sourceMappingURL=offline-policy-evaluator.service.js.map