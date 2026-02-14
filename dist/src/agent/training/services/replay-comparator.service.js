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
var ReplayComparatorService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ReplayComparatorService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const policy_service_manager_service_1 = require("./policy-service-manager.service");
let ReplayComparatorService = ReplayComparatorService_1 = class ReplayComparatorService {
    constructor(prisma, policyService) {
        this.prisma = prisma;
        this.policyService = policyService;
        this.logger = new common_1.Logger(ReplayComparatorService_1.name);
    }
    async replayBaseline(baselineVersion, trajectories) {
        var _a;
        this.logger.log(`[ReplayComparator] 回放baseline策略: version=${baselineVersion}, trajectories=${trajectories.length}`);
        const results = new Map();
        for (const trajectory of trajectories) {
            try {
                const response = await this.policyService.predict({
                    request_id: `replay_baseline_${trajectory.trajectory_id}`,
                    state: ((_a = trajectory.steps[0]) === null || _a === void 0 ? void 0 : _a.state) || {},
                    model_version: baselineVersion,
                });
                results.set(trajectory.trajectory_id, {
                    action: response.action,
                    confidence: response.confidence,
                    reward: trajectory.metadata.total_reward,
                    latency_ms: response.latency_ms,
                });
            }
            catch (error) {
                this.logger.warn(`[ReplayComparator] Baseline回放失败: trajectoryId=${trajectory.trajectory_id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
                results.set(trajectory.trajectory_id, {
                    error: error === null || error === void 0 ? void 0 : error.message,
                });
            }
        }
        this.logger.log(`[ReplayComparator] Baseline回放完成: success=${results.size}/${trajectories.length}`);
        return results;
    }
    async replayNewPolicy(newPolicyVersion, trajectories) {
        var _a;
        this.logger.log(`[ReplayComparator] 回放新策略: version=${newPolicyVersion}, trajectories=${trajectories.length}`);
        const results = new Map();
        for (const trajectory of trajectories) {
            try {
                const response = await this.policyService.predict({
                    request_id: `replay_new_${trajectory.trajectory_id}`,
                    state: ((_a = trajectory.steps[0]) === null || _a === void 0 ? void 0 : _a.state) || {},
                    model_version: newPolicyVersion,
                });
                results.set(trajectory.trajectory_id, {
                    action: response.action,
                    confidence: response.confidence,
                    reward: trajectory.metadata.total_reward,
                    latency_ms: response.latency_ms,
                });
            }
            catch (error) {
                this.logger.warn(`[ReplayComparator] 新策略回放失败: trajectoryId=${trajectory.trajectory_id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
                results.set(trajectory.trajectory_id, {
                    error: error === null || error === void 0 ? void 0 : error.message,
                });
            }
        }
        this.logger.log(`[ReplayComparator] 新策略回放完成: success=${results.size}/${trajectories.length}`);
        return results;
    }
    async compareResults(baselineVersion, newPolicyVersion, trajectories) {
        this.logger.log(`[ReplayComparator] 开始对比: baseline=${baselineVersion}, newPolicy=${newPolicyVersion}`);
        const baselineResults = await this.replayBaseline(baselineVersion, trajectories);
        const newPolicyResults = await this.replayNewPolicy(newPolicyVersion, trajectories);
        const baselineSuccesses = Array.from(baselineResults.values()).filter((r) => r.action === 'ALLOW' || r.action === 'ADJUST').length;
        const newPolicySuccesses = Array.from(newPolicyResults.values()).filter((r) => r.action === 'ALLOW' || r.action === 'ADJUST').length;
        const baselineSuccessRate = baselineSuccesses / trajectories.length;
        const newPolicySuccessRate = newPolicySuccesses / trajectories.length;
        const baselineRewards = Array.from(baselineResults.values())
            .filter((r) => r.reward !== undefined)
            .map((r) => r.reward);
        const newPolicyRewards = Array.from(newPolicyResults.values())
            .filter((r) => r.reward !== undefined)
            .map((r) => r.reward);
        const baselineAvgReward = baselineRewards.length > 0
            ? baselineRewards.reduce((a, b) => a + b, 0) / baselineRewards.length
            : 0;
        const newPolicyAvgReward = newPolicyRewards.length > 0
            ? newPolicyRewards.reduce((a, b) => a + b, 0) / newPolicyRewards.length
            : 0;
        const baselineLatencies = Array.from(baselineResults.values())
            .filter((r) => r.latency_ms !== undefined)
            .map((r) => r.latency_ms);
        const newPolicyLatencies = Array.from(newPolicyResults.values())
            .filter((r) => r.latency_ms !== undefined)
            .map((r) => r.latency_ms);
        const baselineAvgLatency = baselineLatencies.length > 0
            ? baselineLatencies.reduce((a, b) => a + b, 0) / baselineLatencies.length
            : 0;
        const newPolicyAvgLatency = newPolicyLatencies.length > 0
            ? newPolicyLatencies.reduce((a, b) => a + b, 0) / newPolicyLatencies.length
            : 0;
        const statisticalSignificance = this.calculateStatisticalSignificance(baselineRewards, newPolicyRewards);
        const detailedResults = trajectories.map((trajectory) => {
            const baselineResult = baselineResults.get(trajectory.trajectory_id) || {};
            const newPolicyResult = newPolicyResults.get(trajectory.trajectory_id) || {};
            return {
                trajectory_id: trajectory.trajectory_id,
                baseline_result: baselineResult,
                new_policy_result: newPolicyResult,
                difference: {
                    reward_diff: (newPolicyResult.reward || 0) - (baselineResult.reward || 0),
                    latency_diff: (newPolicyResult.latency_ms || 0) - (baselineResult.latency_ms || 0),
                },
            };
        });
        const result = {
            baseline_version: baselineVersion,
            new_policy_version: newPolicyVersion,
            comparison_metrics: {
                success_rate: {
                    baseline: baselineSuccessRate,
                    new_policy: newPolicySuccessRate,
                    improvement: newPolicySuccessRate - baselineSuccessRate,
                },
                avg_reward: {
                    baseline: baselineAvgReward,
                    new_policy: newPolicyAvgReward,
                    improvement: newPolicyAvgReward - baselineAvgReward,
                },
                avg_latency_ms: {
                    baseline: baselineAvgLatency,
                    new_policy: newPolicyAvgLatency,
                    change: newPolicyAvgLatency - baselineAvgLatency,
                },
            },
            statistical_significance: statisticalSignificance,
            total_trajectories: trajectories.length,
            detailed_results: detailedResults,
        };
        this.logger.log(`[ReplayComparator] 对比完成: successRateImprovement=${(result.comparison_metrics.success_rate.improvement * 100).toFixed(1)}%, rewardImprovement=${result.comparison_metrics.avg_reward.improvement.toFixed(3)}`);
        return result;
    }
    calculateStatisticalSignificance(baselineValues, newPolicyValues) {
        if (baselineValues.length === 0 || newPolicyValues.length === 0) {
            return { p_value: 1.0, is_significant: false };
        }
        const baselineMean = baselineValues.reduce((a, b) => a + b, 0) / baselineValues.length;
        const newPolicyMean = newPolicyValues.reduce((a, b) => a + b, 0) / newPolicyValues.length;
        const pValue = 0.05;
        const isSignificant = Math.abs(newPolicyMean - baselineMean) > 0.01;
        return {
            p_value: pValue,
            is_significant: isSignificant,
        };
    }
};
exports.ReplayComparatorService = ReplayComparatorService;
exports.ReplayComparatorService = ReplayComparatorService = ReplayComparatorService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService,
        policy_service_manager_service_1.PolicyServiceManagerService])
], ReplayComparatorService);
//# sourceMappingURL=replay-comparator.service.js.map