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
var RollABTestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollABTestService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const ab_test_manager_service_1 = require("./ab-test-manager.service");
const roll_client_service_1 = require("./roll-client.service");
const roll_policy_adapter_service_1 = require("./roll-policy-adapter.service");
const roll_reward_adapter_service_1 = require("./roll-reward-adapter.service");
const roll_trajectory_adapter_service_1 = require("./roll-trajectory-adapter.service");
let RollABTestService = RollABTestService_1 = class RollABTestService {
    constructor(configService, abTestManager, rollClient, rollPolicyAdapter, rollRewardAdapter, rollTrajectoryAdapter) {
        this.configService = configService;
        this.abTestManager = abTestManager;
        this.rollClient = rollClient;
        this.rollPolicyAdapter = rollPolicyAdapter;
        this.rollRewardAdapter = rollRewardAdapter;
        this.rollTrajectoryAdapter = rollTrajectoryAdapter;
        this.logger = new common_1.Logger(RollABTestService_1.name);
        this.enabled =
            this.configService.get('ROLL_AB_TEST_ENABLED') !== false &&
                !!this.rollClient;
        this.logger.log(`[RollABTest] 初始化: enabled=${this.enabled}`);
    }
    async createRollExperiment(name, description, variants, successMetrics) {
        if (!this.enabled) {
            throw new Error('ROLL A/B 测试未启用');
        }
        this.logger.log(`[RollABTest] 创建 ROLL A/B 测试实验: ${name}`);
        const abTestVariants = variants.map((v) => ({
            name: v.name,
            model_version: v.roll_enabled ? 'roll-enabled' : 'roll-disabled',
            traffic_percentage: v.traffic_percentage,
            metadata: {
                roll_enabled: v.roll_enabled,
                roll_config: v.roll_config,
            },
        }));
        const experiment = await this.abTestManager.createExperiment(name, description, abTestVariants, successMetrics);
        this.logger.log(`[RollABTest] ROLL A/B 测试实验已创建: experimentId=${experiment.experiment_id}`);
        return {
            experimentId: experiment.experiment_id,
            success: true,
        };
    }
    async shouldUseRoll(experimentId, requestId, userId) {
        if (!this.enabled) {
            return { useRoll: false };
        }
        try {
            const assignment = await this.abTestManager.assignToGroup(experimentId, requestId, userId);
            const experiment = this.abTestManager.getExperiment(experimentId);
            if (!experiment) {
                return { useRoll: false };
            }
            const variant = experiment.variants.find((v) => v.variant_id === assignment.variant_id);
            if (!variant) {
                return { useRoll: false };
            }
            const metadata = variant.metadata;
            const useRoll = (metadata === null || metadata === void 0 ? void 0 : metadata.roll_enabled) === true ||
                variant.model_version === 'roll-enabled';
            this.logger.debug(`[RollABTest] 实验分配: experimentId=${experimentId}, variantId=${assignment.variant_id}, useRoll=${useRoll}`);
            return {
                useRoll,
                variantId: assignment.variant_id,
                rollConfig: metadata === null || metadata === void 0 ? void 0 : metadata.roll_config,
            };
        }
        catch (error) {
            this.logger.warn(`[RollABTest] 获取实验分配失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return { useRoll: false };
        }
    }
    async predictWithRollABTest(experimentId, request, requestId, userId) {
        const { useRoll, variantId, rollConfig } = await this.shouldUseRoll(experimentId, requestId, userId);
        if (useRoll && this.rollPolicyAdapter) {
            const result = await this.rollPolicyAdapter.predict(request);
            this.logger.debug(`[RollABTest] 使用 ROLL Policy-Worker: experimentId=${experimentId}, variantId=${variantId}`);
            return {
                action: result.action || 'ALLOW',
                confidence: result.confidence || 0.8,
                variantId,
                useRoll: true,
            };
        }
        return {
            action: 'ALLOW',
            confidence: 0.8,
            variantId,
            useRoll: false,
        };
    }
    async computeRewardWithRollABTest(experimentId, trajectory, requestId, userId, rewardConfig) {
        const { useRoll, variantId } = await this.shouldUseRoll(experimentId, requestId, userId);
        if (useRoll && this.rollRewardAdapter) {
            const trajectoryData = Array.isArray(trajectory) ? trajectory[0] : trajectory;
            const userRequest = (trajectoryData === null || trajectoryData === void 0 ? void 0 : trajectoryData.userRequest) || (trajectoryData === null || trajectoryData === void 0 ? void 0 : trajectoryData.user_request) || 'A/B Test Request';
            const evidence = (trajectoryData === null || trajectoryData === void 0 ? void 0 : trajectoryData.evidence) || [];
            const decisionLog = (trajectoryData === null || trajectoryData === void 0 ? void 0 : trajectoryData.decisionLog) || (trajectoryData === null || trajectoryData === void 0 ? void 0 : trajectoryData.decision_log) || [];
            const result = await this.rollRewardAdapter.computeReward(trajectoryData, userRequest, evidence, decisionLog);
            this.logger.debug(`[RollABTest] 使用 ROLL Reward-Worker: experimentId=${experimentId}, variantId=${variantId}`);
            return {
                reward: result.reward || 0,
                variantId,
                useRoll: true,
            };
        }
        return {
            reward: 0.5,
            variantId,
            useRoll: false,
        };
    }
    async generateTrajectoryWithRollABTest(experimentId, data, requestId, userId) {
        const { useRoll, variantId } = await this.shouldUseRoll(experimentId, requestId, userId);
        if (useRoll && this.rollTrajectoryAdapter) {
            const result = await this.rollTrajectoryAdapter.generateTrajectory(data);
            this.logger.debug(`[RollABTest] 使用 ROLL Actor-Worker: experimentId=${experimentId}, variantId=${variantId}`);
            return {
                trajectoryId: result.trajectoryId,
                trajectory: result.trajectory,
                variantId,
                useRoll: true,
            };
        }
        return {
            variantId,
            useRoll: false,
        };
    }
    async analyzeRollResults(experimentId, variantMetrics) {
        const abTestResult = await this.abTestManager.analyzeResults(experimentId, variantMetrics);
        const rollVariant = variantMetrics.find((v) => v.roll_enabled === true);
        const baselineVariant = variantMetrics.find((v) => v.roll_enabled === false);
        if (!rollVariant || !baselineVariant) {
            return {
                experimentId,
                rollVsBaseline: {
                    roll_variant: rollVariant,
                    baseline_variant: baselineVariant,
                    improvement: {
                        success_rate: 0,
                        avg_reward: 0,
                        avg_latency: 0,
                    },
                },
                recommendation: '需要 ROLL 和基线变体的数据',
            };
        }
        const rollSuccessRate = rollVariant.success_count / rollVariant.sample_size;
        const baselineSuccessRate = baselineVariant.success_count / baselineVariant.sample_size;
        const successRateImprovement = rollSuccessRate - baselineSuccessRate;
        const rollAvgReward = rollVariant.total_reward / rollVariant.sample_size;
        const baselineAvgReward = baselineVariant.total_reward / baselineVariant.sample_size;
        const rewardImprovement = rollAvgReward - baselineAvgReward;
        const rollAvgLatency = rollVariant.total_latency_ms / rollVariant.sample_size;
        const baselineAvgLatency = baselineVariant.total_latency_ms / baselineVariant.sample_size;
        const latencyImprovement = baselineAvgLatency - rollAvgLatency;
        let recommendation = '继续观察';
        if (successRateImprovement > 0.05 &&
            rewardImprovement > 0.1 &&
            latencyImprovement > 0) {
            recommendation = 'ROLL 变体表现更好，建议逐步扩大流量';
        }
        else if (successRateImprovement < -0.05 ||
            rewardImprovement < -0.1 ||
            latencyImprovement < -100) {
            recommendation = '基线变体表现更好，建议回退 ROLL';
        }
        return {
            experimentId,
            rollVsBaseline: {
                roll_variant: rollVariant,
                baseline_variant: baselineVariant,
                improvement: {
                    success_rate: successRateImprovement,
                    avg_reward: rewardImprovement,
                    avg_latency: latencyImprovement,
                },
            },
            recommendation,
        };
    }
};
exports.RollABTestService = RollABTestService;
exports.RollABTestService = RollABTestService = RollABTestService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        ab_test_manager_service_1.ABTestManagerService,
        roll_client_service_1.RollClientService,
        roll_policy_adapter_service_1.RollPolicyAdapterService,
        roll_reward_adapter_service_1.RollRewardAdapterService,
        roll_trajectory_adapter_service_1.RollTrajectoryAdapterService])
], RollABTestService);
//# sourceMappingURL=roll-ab-test.service.js.map