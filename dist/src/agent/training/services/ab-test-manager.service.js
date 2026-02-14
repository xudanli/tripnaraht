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
var ABTestManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ABTestManagerService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_1 = require("../../../prisma/prisma.service");
const crypto_1 = require("crypto");
const crypto_2 = require("crypto");
let ABTestManagerService = ABTestManagerService_1 = class ABTestManagerService {
    constructor(prisma) {
        this.prisma = prisma;
        this.logger = new common_1.Logger(ABTestManagerService_1.name);
        this.experiments = new Map();
        this.assignments = new Map();
        this.defaultRolloutPhases = [
            {
                phase: 1,
                traffic_percentage: 10,
                duration_days: 3,
                success_criteria: {
                    min_success_rate: 0.95,
                    max_error_rate: 0.05,
                },
            },
            {
                phase: 2,
                traffic_percentage: 25,
                duration_days: 3,
                success_criteria: {
                    min_success_rate: 0.95,
                    max_error_rate: 0.05,
                },
            },
            {
                phase: 3,
                traffic_percentage: 50,
                duration_days: 3,
                success_criteria: {
                    min_success_rate: 0.95,
                    max_error_rate: 0.05,
                },
            },
            {
                phase: 4,
                traffic_percentage: 100,
                duration_days: 0,
                success_criteria: {},
            },
        ];
    }
    async createExperiment(name, description, variants, successMetrics) {
        this.logger.log(`[ABTestManager] 创建A/B实验: name=${name}`);
        const totalTraffic = variants.reduce((sum, v) => sum + v.traffic_percentage, 0);
        if (Math.abs(totalTraffic - 100) > 0.01) {
            throw new Error(`Traffic percentages must sum to 100%, got ${totalTraffic}%`);
        }
        const experiment = {
            experiment_id: `exp_${(0, crypto_1.randomUUID)()}`,
            name,
            description,
            variants: variants.map((v, index) => ({
                variant_id: `variant_${index + 1}`,
                name: v.name,
                model_version: v.model_version,
                traffic_percentage: v.traffic_percentage,
            })),
            start_date: new Date().toISOString(),
            status: 'DRAFT',
            success_metrics: successMetrics,
            created_at: new Date().toISOString(),
        };
        this.experiments.set(experiment.experiment_id, experiment);
        this.logger.log(`[ABTestManager] A/B实验已创建: experimentId=${experiment.experiment_id}`);
        return experiment;
    }
    async startExperiment(experimentId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }
        experiment.status = 'RUNNING';
        this.logger.log(`[ABTestManager] 实验已启动: experimentId=${experimentId}`);
    }
    async assignToGroup(experimentId, requestId, userId) {
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }
        if (experiment.status !== 'RUNNING') {
            throw new Error(`Experiment is not running: ${experiment.status}`);
        }
        const hashInput = userId || requestId;
        const hash = this.consistentHash(hashInput, experimentId);
        const bucket = hash % 100;
        let cumulativePercentage = 0;
        let assignedVariant = experiment.variants[0];
        for (const variant of experiment.variants) {
            cumulativePercentage += variant.traffic_percentage;
            if (bucket < cumulativePercentage) {
                assignedVariant = variant;
                break;
            }
        }
        const assignment = {
            experiment_id: experimentId,
            variant_id: assignedVariant.variant_id,
            user_id: userId,
            request_id: requestId,
            assignment_method: 'CONSISTENT_HASH',
            timestamp: new Date().toISOString(),
        };
        const assignmentKey = `${experimentId}_${requestId}`;
        this.assignments.set(assignmentKey, assignment);
        this.logger.debug(`[ABTestManager] 用户已分配到实验组: experimentId=${experimentId}, variantId=${assignedVariant.variant_id}`);
        return assignment;
    }
    async analyzeResults(experimentId, variantMetrics) {
        this.logger.log(`[ABTestManager] 分析实验结果: experimentId=${experimentId}`);
        const experiment = this.experiments.get(experimentId);
        if (!experiment) {
            throw new Error(`Experiment not found: ${experimentId}`);
        }
        const variantResults = variantMetrics.map((m) => ({
            variant_id: m.variant_id,
            sample_size: m.sample_size,
            success_rate: m.sample_size > 0 ? m.success_count / m.sample_size : 0,
            avg_reward: m.sample_size > 0 ? m.total_reward / m.sample_size : 0,
            avg_latency_ms: m.sample_size > 0 ? m.total_latency_ms / m.sample_size : 0,
            error_rate: m.sample_size > 0 ? m.error_count / m.sample_size : 0,
        }));
        const statisticalSignificance = this.calculateStatisticalSignificance(variantResults);
        const winnerVariant = variantResults.reduce((best, current) => {
            const bestScore = best.success_rate * 0.5 + best.avg_reward * 0.3 - best.error_rate * 0.2;
            const currentScore = current.success_rate * 0.5 +
                current.avg_reward * 0.3 -
                current.error_rate * 0.2;
            return currentScore > bestScore ? current : best;
        });
        const result = {
            experiment_id: experimentId,
            variant_results: variantResults,
            statistical_significance: {
                ...statisticalSignificance,
                winner_variant_id: statisticalSignificance.is_significant
                    ? winnerVariant.variant_id
                    : undefined,
            },
            analysis_date: new Date().toISOString(),
        };
        this.logger.log(`[ABTestManager] 实验结果分析完成: winnerVariant=${result.statistical_significance.winner_variant_id || 'N/A'}`);
        return result;
    }
    consistentHash(input, salt) {
        const hashInput = `${salt}:${input}`;
        const hash = (0, crypto_2.createHash)('md5').update(hashInput).digest('hex');
        return parseInt(hash.substring(0, 8), 16);
    }
    calculateStatisticalSignificance(variantResults) {
        if (variantResults.length < 2) {
            return { p_value: 1.0, is_significant: false };
        }
        const rates = variantResults.map((v) => v.success_rate);
        const maxRate = Math.max(...rates);
        const minRate = Math.min(...rates);
        const diff = maxRate - minRate;
        const isSignificant = diff > 0.05 && variantResults.every((v) => v.sample_size >= 100);
        return {
            p_value: isSignificant ? 0.05 : 0.5,
            is_significant: isSignificant,
        };
    }
    getExperiment(experimentId) {
        return this.experiments.get(experimentId);
    }
    listExperiments(status) {
        let experiments = Array.from(this.experiments.values());
        if (status) {
            experiments = experiments.filter((e) => e.status === status);
        }
        return experiments.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    }
    getRolloutPhases() {
        return [...this.defaultRolloutPhases];
    }
};
exports.ABTestManagerService = ABTestManagerService;
exports.ABTestManagerService = ABTestManagerService = ABTestManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_1.PrismaService])
], ABTestManagerService);
//# sourceMappingURL=ab-test-manager.service.js.map