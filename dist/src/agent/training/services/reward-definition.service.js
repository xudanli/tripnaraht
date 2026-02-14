"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var RewardDefinitionService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RewardDefinitionService = void 0;
const common_1 = require("@nestjs/common");
let RewardDefinitionService = RewardDefinitionService_1 = class RewardDefinitionService {
    constructor() {
        this.logger = new common_1.Logger(RewardDefinitionService_1.name);
        this.gatedConfig = {
            gates: {
                safety_gate: {
                    threshold: 0.9,
                    penalty: -2.0,
                    description: '安全门控：天气/地形/道路风险',
                },
                compliance_gate: {
                    threshold: 0.95,
                    penalty: -1.5,
                    description: '合规门控：法律/签证/许可',
                },
                feasibility_gate: {
                    threshold: 0.8,
                    penalty: -1.0,
                    description: '可执行门控：交通/时间/物理可达',
                },
            },
            experience: {
                satisfaction: 0.4,
                diversity: 0.25,
                cost_efficiency: 0.2,
                novelty: 0.15,
            },
            version: '2.0.0',
        };
        this.defaultConfig = {
            weights: {
                success_rate: 0.4,
                satisfaction: 0.3,
                cost: -0.2,
                compliance_rate: 0.1,
            },
            normalization: {
                success_rate_range: [0, 1],
                satisfaction_range: [0, 1],
                cost_range: [0, 1],
                compliance_rate_range: [0, 1],
            },
        };
    }
    calculateGatedReward(metrics, config = this.gatedConfig) {
        this.logger.debug(`[GatedReward] 计算开始: safety=${metrics.safety_score}, compliance=${metrics.compliance_score}, feasibility=${metrics.feasibility_score}`);
        const gateScores = {
            safety: metrics.safety_score,
            compliance: metrics.compliance_score,
            feasibility: metrics.feasibility_score,
        };
        if (metrics.safety_score < config.gates.safety_gate.threshold) {
            this.logger.warn(`[GatedReward] 安全门控失败: ${metrics.safety_score} < ${config.gates.safety_gate.threshold}`);
            return this.createGateFailureResult('SAFETY_GATE', config.gates.safety_gate.penalty, `安全门控未通过: ${metrics.safety_score.toFixed(2)} < ${config.gates.safety_gate.threshold}`, gateScores, config.version);
        }
        if (metrics.compliance_score < config.gates.compliance_gate.threshold) {
            this.logger.warn(`[GatedReward] 合规门控失败: ${metrics.compliance_score} < ${config.gates.compliance_gate.threshold}`);
            return this.createGateFailureResult('COMPLIANCE_GATE', config.gates.compliance_gate.penalty, `合规门控未通过: ${metrics.compliance_score.toFixed(2)} < ${config.gates.compliance_gate.threshold}`, gateScores, config.version);
        }
        if (metrics.feasibility_score < config.gates.feasibility_gate.threshold) {
            this.logger.warn(`[GatedReward] 可执行门控失败: ${metrics.feasibility_score} < ${config.gates.feasibility_gate.threshold}`);
            return this.createGateFailureResult('FEASIBILITY_GATE', config.gates.feasibility_gate.penalty, `可执行门控未通过: ${metrics.feasibility_score.toFixed(2)} < ${config.gates.feasibility_gate.threshold}`, gateScores, config.version);
        }
        const satisfactionScore = metrics.satisfaction * config.experience.satisfaction;
        const diversityScore = metrics.diversity * config.experience.diversity;
        const costEfficiencyScore = metrics.cost_efficiency * config.experience.cost_efficiency;
        const noveltyScore = metrics.novelty * config.experience.novelty;
        const baseScore = satisfactionScore + diversityScore + costEfficiencyScore + noveltyScore;
        let evidenceBonus = 0;
        if (metrics.evidence_coverage && metrics.evidence_coverage > 0.8) {
            evidenceBonus = (metrics.evidence_coverage - 0.8) * 0.1;
        }
        let riskDisclosureBonus = 0;
        if (metrics.risk_disclosure === true) {
            riskDisclosureBonus = 0.05;
        }
        const totalReward = Math.min(1.0, baseScore + evidenceBonus + riskDisclosureBonus);
        const result = {
            total_reward: totalReward,
            gate_passed: true,
            trainable_for_dpo: true,
            trainable_for_ppo: true,
            reward_type: 'FULL_SUCCESS',
            preference_label: 'POSITIVE',
            reason: '所有门控通过，体验分计算完成',
            experience_breakdown: {
                satisfaction: satisfactionScore,
                diversity: diversityScore,
                cost_efficiency: costEfficiencyScore,
                novelty: noveltyScore,
                base_score: baseScore,
                preference_bonus: evidenceBonus + riskDisclosureBonus,
            },
            gate_scores: gateScores,
            metadata: {
                calculation_time: new Date().toISOString(),
                config_version: config.version,
            },
        };
        this.logger.debug(`[GatedReward] 计算完成: totalReward=${totalReward.toFixed(3)}, gate_passed=true`);
        return result;
    }
    createGateFailureResult(gateFailure, penalty, reason, gateScores, configVersion) {
        return {
            total_reward: penalty,
            gate_passed: false,
            gate_failure: gateFailure,
            trainable_for_dpo: false,
            trainable_for_ppo: false,
            reward_type: 'GATE_FAILURE',
            preference_label: null,
            reason,
            gate_scores: gateScores,
            metadata: {
                calculation_time: new Date().toISOString(),
                config_version: configVersion,
            },
        };
    }
    calculateTripNARAReward(signals, metrics) {
        var _a;
        const config = this.gatedConfig;
        if (!signals.system_approval.system_approved) {
            const rejectionReason = ((_a = signals.system_approval.rejection_reasons) === null || _a === void 0 ? void 0 : _a.join(', ')) || '系统门控失败';
            this.logger.warn(`[TripNARAReward] 系统门控失败: ${rejectionReason}`);
            return {
                total_reward: -2.0,
                gate_passed: false,
                trainable_for_dpo: false,
                trainable_for_ppo: false,
                reward_type: 'GATE_FAILURE',
                preference_label: null,
                reason: `系统门控失败: ${rejectionReason}`,
                gate_scores: {
                    safety: signals.system_approval.safety_pass ? 1.0 : 0.0,
                    compliance: signals.system_approval.compliance_pass ? 1.0 : 0.0,
                    feasibility: signals.system_approval.feasibility_pass ? 1.0 : 0.0,
                },
                metadata: {
                    calculation_time: new Date().toISOString(),
                    config_version: config.version,
                },
            };
        }
        if (!signals.user_preference.user_approved) {
            this.logger.debug(`[TripNARAReward] 系统通过但用户未采纳 → DPO 负样本`);
            return {
                total_reward: 0.3,
                gate_passed: true,
                trainable_for_dpo: true,
                trainable_for_ppo: false,
                reward_type: 'USER_REJECTED',
                preference_label: 'NEGATIVE',
                reason: '系统通过但用户未采纳',
                gate_scores: {
                    safety: 1.0,
                    compliance: 1.0,
                    feasibility: 1.0,
                },
                metadata: {
                    calculation_time: new Date().toISOString(),
                    config_version: config.version,
                },
            };
        }
        const experienceScore = this.calculateExperienceScore(metrics);
        const preferenceBonus = this.calculatePreferenceBonus(signals.user_preference);
        const totalReward = Math.min(1.0, experienceScore + preferenceBonus);
        this.logger.debug(`[TripNARAReward] 完全成功: experienceScore=${experienceScore.toFixed(3)}, preferenceBonus=${preferenceBonus.toFixed(3)}, total=${totalReward.toFixed(3)}`);
        return {
            total_reward: totalReward,
            gate_passed: true,
            trainable_for_dpo: true,
            trainable_for_ppo: true,
            reward_type: 'FULL_SUCCESS',
            preference_label: 'POSITIVE',
            reason: '系统通过且用户采纳',
            experience_breakdown: {
                satisfaction: metrics.satisfaction * this.gatedConfig.experience.satisfaction,
                diversity: metrics.diversity * this.gatedConfig.experience.diversity,
                cost_efficiency: metrics.cost_efficiency * this.gatedConfig.experience.cost_efficiency,
                novelty: metrics.novelty * this.gatedConfig.experience.novelty,
                base_score: experienceScore,
                preference_bonus: preferenceBonus,
            },
            gate_scores: {
                safety: 1.0,
                compliance: 1.0,
                feasibility: 1.0,
            },
            metadata: {
                calculation_time: new Date().toISOString(),
                config_version: this.gatedConfig.version,
            },
        };
    }
    calculateExperienceScore(metrics) {
        const config = this.gatedConfig.experience;
        return (metrics.satisfaction * config.satisfaction +
            metrics.diversity * config.diversity +
            metrics.cost_efficiency * config.cost_efficiency +
            metrics.novelty * config.novelty);
    }
    calculatePreferenceBonus(preference) {
        let bonus = 0;
        if (preference.satisfaction_rating) {
            bonus += ((preference.satisfaction_rating - 3) / 2) * 0.1;
        }
        if (preference.preference_factors) {
            const factors = preference.preference_factors;
            const avgFactor = (factors.route_appeal +
                factors.pacing_comfort +
                factors.poi_interest +
                factors.cost_acceptability) / 4;
            if (avgFactor > 0.7) {
                bonus += (avgFactor - 0.7) * 0.1;
            }
        }
        return Math.max(0, Math.min(0.2, bonus));
    }
    getGatedConfig() {
        return { ...this.gatedConfig };
    }
    updateGateThresholds(gates) {
        if (gates.safety !== undefined) {
            this.gatedConfig.gates.safety_gate.threshold = gates.safety;
        }
        if (gates.compliance !== undefined) {
            this.gatedConfig.gates.compliance_gate.threshold = gates.compliance;
        }
        if (gates.feasibility !== undefined) {
            this.gatedConfig.gates.feasibility_gate.threshold = gates.feasibility;
        }
        this.logger.log(`[GatedReward] 门控阈值已更新: safety=${this.gatedConfig.gates.safety_gate.threshold}, compliance=${this.gatedConfig.gates.compliance_gate.threshold}, feasibility=${this.gatedConfig.gates.feasibility_gate.threshold}`);
        return { ...this.gatedConfig };
    }
    updateExperienceWeights(weights) {
        if (weights.satisfaction !== undefined) {
            this.gatedConfig.experience.satisfaction = weights.satisfaction;
        }
        if (weights.diversity !== undefined) {
            this.gatedConfig.experience.diversity = weights.diversity;
        }
        if (weights.cost_efficiency !== undefined) {
            this.gatedConfig.experience.cost_efficiency = weights.cost_efficiency;
        }
        if (weights.novelty !== undefined) {
            this.gatedConfig.experience.novelty = weights.novelty;
        }
        const total = this.gatedConfig.experience.satisfaction +
            this.gatedConfig.experience.diversity +
            this.gatedConfig.experience.cost_efficiency +
            this.gatedConfig.experience.novelty;
        if (total > 0 && total !== 1) {
            this.gatedConfig.experience.satisfaction /= total;
            this.gatedConfig.experience.diversity /= total;
            this.gatedConfig.experience.cost_efficiency /= total;
            this.gatedConfig.experience.novelty /= total;
        }
        this.logger.log(`[GatedReward] 体验权重已更新: ${JSON.stringify(this.gatedConfig.experience)}`);
        return { ...this.gatedConfig };
    }
    calculateReward(metrics, config = this.defaultConfig) {
        this.logger.debug(`[RewardDefinition] [Legacy] 计算Reward: successRate=${metrics.success_rate}, satisfaction=${metrics.satisfaction}`);
        const normalizedSuccessRate = this.normalize(metrics.success_rate, config.normalization.success_rate_range);
        const normalizedSatisfaction = this.normalize(metrics.satisfaction, config.normalization.satisfaction_range);
        const normalizedCost = this.normalize(metrics.cost, config.normalization.cost_range);
        const normalizedComplianceRate = this.normalize(metrics.compliance_rate, config.normalization.compliance_rate_range);
        const successRateReward = normalizedSuccessRate * config.weights.success_rate;
        const satisfactionReward = normalizedSatisfaction * config.weights.satisfaction;
        const costReward = normalizedCost * config.weights.cost;
        const complianceRateReward = normalizedComplianceRate * config.weights.compliance_rate;
        const totalReward = successRateReward + satisfactionReward + costReward + complianceRateReward;
        const result = {
            total_reward: totalReward,
            component_rewards: {
                success_rate_reward: successRateReward,
                satisfaction_reward: satisfactionReward,
                cost_reward: costReward,
                compliance_rate_reward: complianceRateReward,
            },
            metadata: {
                calculation_time: new Date().toISOString(),
                config_version: '1.0.0',
            },
        };
        this.logger.debug(`[RewardDefinition] [Legacy] Reward计算完成: totalReward=${totalReward.toFixed(3)}`);
        return result;
    }
    normalize(value, range) {
        const [min, max] = range;
        if (max === min)
            return 0;
        return Math.max(0, Math.min(1, (value - min) / (max - min)));
    }
    updateWeights(weights) {
        const newWeights = { ...this.defaultConfig.weights, ...weights };
        const totalWeight = Math.abs(newWeights.success_rate) +
            Math.abs(newWeights.satisfaction) +
            Math.abs(newWeights.cost) +
            Math.abs(newWeights.compliance_rate);
        if (totalWeight > 0) {
            newWeights.success_rate = newWeights.success_rate / totalWeight;
            newWeights.satisfaction = newWeights.satisfaction / totalWeight;
            newWeights.cost = newWeights.cost / totalWeight;
            newWeights.compliance_rate = newWeights.compliance_rate / totalWeight;
        }
        const newConfig = {
            ...this.defaultConfig,
            weights: newWeights,
        };
        this.logger.log(`[RewardDefinition] [Legacy] 权重已更新: ${JSON.stringify(newWeights)}`);
        return newConfig;
    }
    getDefaultConfig() {
        return { ...this.defaultConfig };
    }
};
exports.RewardDefinitionService = RewardDefinitionService;
exports.RewardDefinitionService = RewardDefinitionService = RewardDefinitionService_1 = __decorate([
    (0, common_1.Injectable)()
], RewardDefinitionService);
//# sourceMappingURL=reward-definition.service.js.map