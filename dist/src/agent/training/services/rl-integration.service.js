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
var RLIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RLIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const policy_service_manager_service_1 = require("./policy-service-manager.service");
const constraints_engine_service_1 = require("./constraints-engine.service");
const trajectory_collection_service_1 = require("./trajectory-collection.service");
const quality_scorer_service_1 = require("./quality-scorer.service");
const observability_service_1 = require("./observability.service");
let RLIntegrationService = RLIntegrationService_1 = class RLIntegrationService {
    constructor(configService, policyService, constraintsEngine, trajectoryCollection, qualityScorer, observability) {
        this.configService = configService;
        this.policyService = policyService;
        this.constraintsEngine = constraintsEngine;
        this.trajectoryCollection = trajectoryCollection;
        this.qualityScorer = qualityScorer;
        this.observability = observability;
        this.logger = new common_1.Logger(RLIntegrationService_1.name);
        this.enabled =
            this.configService.get('RL_INTEGRATION_ENABLED') !== false;
        this.logger.log(`[RLIntegration] 初始化: enabled=${this.enabled}`);
    }
    async preDecision(context) {
        var _a, _b;
        if (!this.enabled) {
            return { allowed: true, action: 'ALLOW', confidence: 1.0 };
        }
        this.logger.debug(`[RLIntegration] 执行前检查: requestId=${context.requestId}, action=${context.action}`);
        const warnings = [];
        let adjustedParams = context.params;
        if (this.constraintsEngine) {
            try {
                const constraintResult = await this.constraintsEngine.checkConstraints(context.params, {
                    country_code: context.params.countryCode || 'UNKNOWN',
                    user_preferences: context.params.preferences || {},
                });
                if (constraintResult.is_blocked) {
                    return {
                        allowed: false,
                        action: 'REJECT',
                        confidence: 0.99,
                        reasoning: `Constraint violations: ${constraintResult.violations.map((v) => v.message).join(', ')}`,
                        warnings: constraintResult.warnings.map((w) => w.message),
                    };
                }
                warnings.push(...constraintResult.warnings.map((w) => w.message));
            }
            catch (error) {
                this.logger.warn(`[RLIntegration] 约束检查失败，继续执行: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        if (this.policyService) {
            try {
                const policyRequest = {
                    request_id: context.requestId,
                    state: {
                        user_request: context.userRequest,
                        origin: context.params.origin,
                        destination: context.params.destination,
                        constraints: {
                            ...context.params.constraints,
                            date_range: context.params.dateRange,
                        },
                        preferences: context.params.preferences,
                    },
                    experiment_id: context.params.experimentId,
                };
                const policyResponse = await this.policyService.predict(policyRequest, true);
                (_a = this.observability) === null || _a === void 0 ? void 0 : _a.recordMetric('policy_inference_latency', policyResponse.latency_ms, { request_id: context.requestId, action: policyResponse.action });
                if (policyResponse.action === 'REJECT') {
                    return {
                        allowed: false,
                        action: 'REJECT',
                        confidence: policyResponse.confidence,
                        reasoning: policyResponse.reasoning,
                        warnings,
                    };
                }
                if (policyResponse.action === 'CLARIFY') {
                    return {
                        allowed: false,
                        action: 'CLARIFY',
                        confidence: policyResponse.confidence,
                        reasoning: policyResponse.reasoning,
                        warnings,
                    };
                }
                if (policyResponse.action === 'ADJUST') {
                    return {
                        allowed: true,
                        action: 'ADJUST',
                        confidence: policyResponse.confidence,
                        reasoning: policyResponse.reasoning,
                        adjustedParams: ((_b = policyResponse.metadata) === null || _b === void 0 ? void 0 : _b.adjusted_params) || adjustedParams,
                        warnings,
                    };
                }
                return {
                    allowed: true,
                    action: 'ALLOW',
                    confidence: policyResponse.confidence,
                    reasoning: policyResponse.reasoning,
                    warnings,
                };
            }
            catch (error) {
                this.logger.warn(`[RLIntegration] 策略推理失败，默认允许: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return {
            allowed: true,
            action: 'ALLOW',
            confidence: 0.5,
            warnings,
        };
    }
    async postDecision(context) {
        var _a, _b;
        if (!this.enabled) {
            return {};
        }
        this.logger.debug(`[RLIntegration] 执行后处理: requestId=${context.requestId}, action=${context.action}, success=${context.success}`);
        let trajectoryId;
        let qualityScore;
        this.logger.debug(`[RLIntegration] 步骤执行: requestId=${context.requestId}, action=${context.action}, success=${context.success}, duration=${context.duration_ms}ms`);
        trajectoryId = context.requestId;
        if (this.qualityScorer &&
            context.success &&
            ((_a = context.result) === null || _a === void 0 ? void 0 : _a.plan)) {
            try {
                const scoreResult = await this.qualityScorer.score(context.result.plan, context.params.userRequest || '', context.result.evidence || [], context.result.decisionLog || []);
                qualityScore = scoreResult.score;
                (_b = this.observability) === null || _b === void 0 ? void 0 : _b.recordMetric('quality_score', qualityScore, { request_id: context.requestId });
            }
            catch (error) {
                this.logger.warn(`[RLIntegration] 质量评分失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return {
            trajectoryId,
            qualityScore,
        };
    }
    async getDecisionContext(requestId) {
        const experimentId = this.configService.get('RL_EXPERIMENT_ID');
        const modelVersion = this.configService.get('RL_MODEL_VERSION');
        const abTestGroup = this.getABTestGroup(requestId);
        const featureFlags = {
            use_policy_service: this.configService.get('RL_USE_POLICY_SERVICE') === true,
            use_constraints_engine: this.configService.get('RL_USE_CONSTRAINTS_ENGINE') !== false,
            use_quality_scorer: this.configService.get('RL_USE_QUALITY_SCORER') === true,
        };
        return {
            experimentId,
            modelVersion,
            abTestGroup,
            featureFlags,
        };
    }
    getABTestGroup(requestId) {
        let hash = 0;
        for (let i = 0; i < requestId.length; i++) {
            const char = requestId.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        const groups = ['control', 'treatment_a', 'treatment_b'];
        const index = Math.abs(hash) % groups.length;
        return groups[index];
    }
    isEnabled() {
        return this.enabled;
    }
    async getHealth() {
        return {
            enabled: this.enabled,
            services: {
                policyService: !!this.policyService,
                constraintsEngine: !!this.constraintsEngine,
                trajectoryCollection: !!this.trajectoryCollection,
                qualityScorer: !!this.qualityScorer,
                observability: !!this.observability,
            },
        };
    }
};
exports.RLIntegrationService = RLIntegrationService;
exports.RLIntegrationService = RLIntegrationService = RLIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        policy_service_manager_service_1.PolicyServiceManagerService,
        constraints_engine_service_1.ConstraintsEngineService,
        trajectory_collection_service_1.TrajectoryCollectionService,
        quality_scorer_service_1.QualityScorerService,
        observability_service_1.ObservabilityService])
], RLIntegrationService);
//# sourceMappingURL=rl-integration.service.js.map