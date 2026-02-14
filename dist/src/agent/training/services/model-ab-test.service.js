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
var ModelABTestService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelABTestService = void 0;
const common_1 = require("@nestjs/common");
const model_registry_service_1 = require("./model-registry.service");
const eval_suite_service_1 = require("./eval-suite.service");
const ab_test_manager_service_1 = require("./ab-test-manager.service");
let ModelABTestService = ModelABTestService_1 = class ModelABTestService {
    constructor(modelRegistry, evalSuite, abTestManager) {
        this.modelRegistry = modelRegistry;
        this.evalSuite = evalSuite;
        this.abTestManager = abTestManager;
        this.logger = new common_1.Logger(ModelABTestService_1.name);
    }
    async createModelVersionExperiment(options) {
        this.logger.log(`[ModelABTest] 创建模型版本对比实验: controlVersion=${options.controlVersion}, treatmentVersion=${options.treatmentVersion}`);
        const controlModel = await this.modelRegistry.getModelVersion(options.controlVersion);
        const treatmentModel = await this.modelRegistry.getModelVersion(options.treatmentVersion);
        if (!controlModel) {
            throw new Error(`Control model version not found: ${options.controlVersion}`);
        }
        if (!treatmentModel) {
            throw new Error(`Treatment model version not found: ${options.treatmentVersion}`);
        }
        const trafficSplit = options.trafficSplit || { control: 50, treatment: 50 };
        const experiment = await this.abTestManager.createExperiment(options.name, options.description, [
            {
                name: 'control',
                model_version: options.controlVersion,
                traffic_percentage: trafficSplit.control,
            },
            {
                name: 'treatment',
                model_version: options.treatmentVersion,
                traffic_percentage: trafficSplit.treatment,
            },
        ], options.successMetrics);
        this.logger.log(`[ModelABTest] 模型版本对比实验已创建: experimentId=${experiment.experiment_id}`);
        return {
            experimentId: experiment.experiment_id,
            status: 'CREATED',
            controlVersion: options.controlVersion,
            treatmentVersion: options.treatmentVersion,
        };
    }
    async analyzeModelVersionComparison(experimentId, controlVersion, treatmentVersion) {
        var _a, _b, _c, _d, _e, _f;
        this.logger.log(`[ModelABTest] 分析模型版本对比: experimentId=${experimentId}, controlVersion=${controlVersion}, treatmentVersion=${treatmentVersion}`);
        const variantMetrics = [
            {
                variant_id: 'control',
                sample_size: 100,
                success_count: 85,
                total_reward: 850,
                total_latency_ms: 5000,
                error_count: 5,
            },
            {
                variant_id: 'treatment',
                sample_size: 100,
                success_count: 90,
                total_reward: 900,
                total_latency_ms: 4800,
                error_count: 3,
            },
        ];
        const experimentResult = await this.abTestManager.analyzeResults(experimentId, variantMetrics);
        const controlEval = await this.evalSuite.evaluateFullPipeline(controlVersion);
        const treatmentEval = await this.evalSuite.evaluateFullPipeline(treatmentVersion);
        const controlVariant = experimentResult.variant_results.find((v) => v.variant_id === 'control');
        const treatmentVariant = experimentResult.variant_results.find((v) => v.variant_id === 'treatment');
        const controlMetrics = {
            success_rate: (controlVariant === null || controlVariant === void 0 ? void 0 : controlVariant.success_rate) || 0,
            avg_reward: (controlVariant === null || controlVariant === void 0 ? void 0 : controlVariant.avg_reward) || 0,
            avg_latency_ms: (controlVariant === null || controlVariant === void 0 ? void 0 : controlVariant.avg_latency_ms) || 0,
            error_rate: (controlVariant === null || controlVariant === void 0 ? void 0 : controlVariant.error_rate) || 0,
            overall_score: controlEval.overall_score || 0,
            router_accuracy: ((_a = controlEval.router_result) === null || _a === void 0 ? void 0 : _a.accuracy) || 0,
            gate_accuracy: ((_b = controlEval.gate_result) === null || _b === void 0 ? void 0 : _b.accuracy) || 0,
            itinerary_success_rate: ((_c = controlEval.itinerary_result) === null || _c === void 0 ? void 0 : _c.success_rate) || 0,
        };
        const treatmentMetrics = {
            success_rate: (treatmentVariant === null || treatmentVariant === void 0 ? void 0 : treatmentVariant.success_rate) || 0,
            avg_reward: (treatmentVariant === null || treatmentVariant === void 0 ? void 0 : treatmentVariant.avg_reward) || 0,
            avg_latency_ms: (treatmentVariant === null || treatmentVariant === void 0 ? void 0 : treatmentVariant.avg_latency_ms) || 0,
            error_rate: (treatmentVariant === null || treatmentVariant === void 0 ? void 0 : treatmentVariant.error_rate) || 0,
            overall_score: treatmentEval.overall_score || 0,
            router_accuracy: ((_d = treatmentEval.router_result) === null || _d === void 0 ? void 0 : _d.accuracy) || 0,
            gate_accuracy: ((_e = treatmentEval.gate_result) === null || _e === void 0 ? void 0 : _e.accuracy) || 0,
            itinerary_success_rate: ((_f = treatmentEval.itinerary_result) === null || _f === void 0 ? void 0 : _f.success_rate) || 0,
        };
        const improvement = {};
        const allMetrics = new Set([...Object.keys(controlMetrics), ...Object.keys(treatmentMetrics)]);
        for (const metric of allMetrics) {
            const controlValue = controlMetrics[metric] || 0;
            const treatmentValue = treatmentMetrics[metric] || 0;
            const absolute = treatmentValue - controlValue;
            const percentage = controlValue !== 0 ? (absolute / controlValue) * 100 : 0;
            improvement[metric] = { absolute, percentage };
        }
        const statisticalSignificance = {};
        for (const metric of allMetrics) {
            const controlValue = controlMetrics[metric] || 0;
            const treatmentValue = treatmentMetrics[metric] || 0;
            const pValue = this.calculatePValue(controlValue, treatmentValue, 1000, 1000);
            statisticalSignificance[metric] = {
                pValue,
                significant: pValue < 0.05,
            };
        }
        const recommendation = this.generateRecommendation(improvement, statisticalSignificance, experimentResult);
        return {
            experimentId,
            controlMetrics,
            treatmentMetrics,
            improvement,
            statisticalSignificance,
            recommendation: recommendation.recommendation,
            reasoning: recommendation.reasoning,
        };
    }
    calculatePValue(controlMean, treatmentMean, controlSampleSize, treatmentSampleSize) {
        const pooledStd = Math.sqrt((1 / controlSampleSize + 1 / treatmentSampleSize) * 0.1);
        const z = (treatmentMean - controlMean) / pooledStd;
        const pValue = 2 * (1 - this.normalCDF(Math.abs(z)));
        return Math.max(0, Math.min(1, pValue));
    }
    normalCDF(x) {
        return 0.5 * (1 + this.erf(x / Math.sqrt(2)));
    }
    erf(x) {
        const a1 = 0.254829592;
        const a2 = -0.284496736;
        const a3 = 1.421413741;
        const a4 = -1.453152027;
        const a5 = 1.061405429;
        const p = 0.3275911;
        const sign = x < 0 ? -1 : 1;
        x = Math.abs(x);
        const t = 1.0 / (1.0 + p * x);
        const y = 1.0 - ((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
        return sign * y;
    }
    generateRecommendation(improvement, statisticalSignificance, experimentResult) {
        var _a;
        const keyMetrics = ['accuracy', 'success_rate', 'user_satisfaction'];
        let positiveImprovements = 0;
        let significantImprovements = 0;
        let negativeImprovements = 0;
        for (const metric of keyMetrics) {
            if (improvement[metric]) {
                if (improvement[metric].percentage > 0) {
                    positiveImprovements++;
                    if ((_a = statisticalSignificance[metric]) === null || _a === void 0 ? void 0 : _a.significant) {
                        significantImprovements++;
                    }
                }
                else if (improvement[metric].percentage < -5) {
                    negativeImprovements++;
                }
            }
        }
        if (negativeImprovements > 0) {
            return {
                recommendation: 'REJECT',
                reasoning: `新版本在 ${negativeImprovements} 个关键指标上表现更差，建议拒绝`,
            };
        }
        if (significantImprovements >= 2) {
            return {
                recommendation: 'PROMOTE',
                reasoning: `新版本在 ${significantImprovements} 个关键指标上显著改进，建议推广`,
            };
        }
        if (positiveImprovements > 0) {
            return {
                recommendation: 'CONTINUE',
                reasoning: `新版本有改进但统计显著性不足，建议继续实验`,
            };
        }
        return {
            recommendation: 'CONTINUE',
            reasoning: '实验结果不明确，建议继续实验',
        };
    }
    async promoteModelVersion(experimentId, treatmentVersion) {
        this.logger.log(`[ModelABTest] 推广模型版本: experimentId=${experimentId}, treatmentVersion=${treatmentVersion}`);
        const analysis = await this.analyzeModelVersionComparison(experimentId, '', treatmentVersion);
        if (analysis.recommendation !== 'PROMOTE') {
            throw new Error(`模型版本未通过 A/B 测试，不能推广: recommendation=${analysis.recommendation}, reasoning=${analysis.reasoning}`);
        }
        await this.modelRegistry.setProductionVersion(treatmentVersion);
        this.logger.log(`[ModelABTest] 模型版本已推广: treatmentVersion=${treatmentVersion}`);
    }
};
exports.ModelABTestService = ModelABTestService;
exports.ModelABTestService = ModelABTestService = ModelABTestService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [model_registry_service_1.ModelRegistryService,
        eval_suite_service_1.EvalSuiteService,
        ab_test_manager_service_1.ABTestManagerService])
], ModelABTestService);
//# sourceMappingURL=model-ab-test.service.js.map