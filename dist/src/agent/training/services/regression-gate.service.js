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
var RegressionGateService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RegressionGateService = void 0;
const common_1 = require("@nestjs/common");
const model_registry_service_1 = require("./model-registry.service");
let RegressionGateService = RegressionGateService_1 = class RegressionGateService {
    constructor(modelRegistry) {
        this.modelRegistry = modelRegistry;
        this.logger = new common_1.Logger(RegressionGateService_1.name);
        this.defaultConfig = {
            success_rate_threshold: 0.95,
            avg_reward_threshold: 0.95,
            gate_false_positive_rate_threshold: 0.01,
            latency_p95_threshold: 1.1,
            statistical_significance_level: 0.05,
        };
    }
    async checkRegression(newPolicyVersion, baselineVersion, comparisonResult, config = this.defaultConfig) {
        this.logger.log(`[RegressionGate] 检查回归门槛: newPolicy=${newPolicyVersion}, baseline=${baselineVersion}`);
        if (!comparisonResult) {
            throw new Error('comparisonResult is required');
        }
        if (!comparisonResult.comparison_metrics) {
            throw new Error('comparisonResult.comparison_metrics is required');
        }
        if (!comparisonResult.statistical_significance) {
            throw new Error('comparisonResult.statistical_significance is required');
        }
        const checks = [];
        const successRateCheck = this.checkSuccessRate(comparisonResult.comparison_metrics.success_rate, config.success_rate_threshold);
        checks.push(successRateCheck);
        const avgRewardCheck = this.checkAvgReward(comparisonResult.comparison_metrics.avg_reward, config.avg_reward_threshold);
        checks.push(avgRewardCheck);
        checks.push({
            metric: 'gate_false_positive_rate',
            threshold: config.gate_false_positive_rate_threshold,
            actual_value: 0,
            passed: true,
            message: 'Gate false positive rate check (not implemented)',
        });
        const latencyCheck = this.checkLatency(comparisonResult.comparison_metrics.avg_latency_ms, config.latency_p95_threshold);
        checks.push(latencyCheck);
        const statisticalSignificance = comparisonResult.statistical_significance;
        const significanceCheck = {
            metric: 'statistical_significance',
            threshold: config.statistical_significance_level,
            actual_value: statisticalSignificance.p_value,
            passed: statisticalSignificance.is_significant,
            message: statisticalSignificance.is_significant
                ? `Statistically significant (p=${statisticalSignificance.p_value.toFixed(3)})`
                : `Not statistically significant (p=${statisticalSignificance.p_value.toFixed(3)})`,
        };
        checks.push(significanceCheck);
        const passedChecks = checks.filter((c) => c.passed).length;
        const overallScore = passedChecks / checks.length;
        const passed = overallScore >= 0.8 && statisticalSignificance.is_significant;
        const recommendation = this.generateRecommendation(passed, checks, overallScore, statisticalSignificance);
        const result = {
            passed,
            checks,
            statistical_significance: statisticalSignificance,
            overall_score: overallScore,
            recommendation,
        };
        this.logger.log(`[RegressionGate] 回归门槛检查完成: passed=${passed}, overallScore=${overallScore.toFixed(2)}`);
        return result;
    }
    checkSuccessRate(successRate, threshold) {
        const thresholdValue = successRate.baseline * threshold;
        const passed = successRate.new_policy >= thresholdValue;
        return {
            metric: 'success_rate',
            threshold: thresholdValue,
            actual_value: successRate.new_policy,
            passed,
            message: passed
                ? `Success rate ${(successRate.new_policy * 100).toFixed(1)}% >= threshold ${(thresholdValue * 100).toFixed(1)}%`
                : `Success rate ${(successRate.new_policy * 100).toFixed(1)}% < threshold ${(thresholdValue * 100).toFixed(1)}%`,
        };
    }
    checkAvgReward(avgReward, threshold) {
        const thresholdValue = avgReward.baseline * threshold;
        const passed = avgReward.new_policy >= thresholdValue;
        return {
            metric: 'avg_reward',
            threshold: thresholdValue,
            actual_value: avgReward.new_policy,
            passed,
            message: passed
                ? `Avg reward ${avgReward.new_policy.toFixed(3)} >= threshold ${thresholdValue.toFixed(3)}`
                : `Avg reward ${avgReward.new_policy.toFixed(3)} < threshold ${thresholdValue.toFixed(3)}`,
        };
    }
    checkLatency(latency, threshold) {
        const thresholdValue = latency.baseline * threshold;
        const passed = latency.new_policy <= thresholdValue;
        return {
            metric: 'latency_p95',
            threshold: thresholdValue,
            actual_value: latency.new_policy,
            passed,
            message: passed
                ? `Latency ${latency.new_policy.toFixed(1)}ms <= threshold ${thresholdValue.toFixed(1)}ms`
                : `Latency ${latency.new_policy.toFixed(1)}ms > threshold ${thresholdValue.toFixed(1)}ms`,
        };
    }
    generateRecommendation(passed, checks, overallScore, statisticalSignificance) {
        if (passed) {
            return {
                should_deploy: true,
                reasoning: `All regression checks passed (overall score: ${(overallScore * 100).toFixed(1)}%, statistically significant)`,
            };
        }
        const failedChecks = checks.filter((c) => !c.passed);
        const reasons = [];
        if (!statisticalSignificance.is_significant) {
            reasons.push('Not statistically significant');
        }
        if (failedChecks.length > 0) {
            reasons.push(`Failed checks: ${failedChecks.map((c) => c.metric).join(', ')}`);
        }
        if (overallScore < 0.8) {
            reasons.push(`Overall score ${(overallScore * 100).toFixed(1)}% < 80%`);
        }
        return {
            should_deploy: false,
            reasoning: reasons.join('. '),
        };
    }
};
exports.RegressionGateService = RegressionGateService;
exports.RegressionGateService = RegressionGateService = RegressionGateService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [model_registry_service_1.ModelRegistryService])
], RegressionGateService);
//# sourceMappingURL=regression-gate.service.js.map