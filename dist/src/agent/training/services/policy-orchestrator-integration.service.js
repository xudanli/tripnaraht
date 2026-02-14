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
var PolicyOrchestratorIntegrationService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyOrchestratorIntegrationService = void 0;
const common_1 = require("@nestjs/common");
const policy_service_manager_service_1 = require("./policy-service-manager.service");
let PolicyOrchestratorIntegrationService = PolicyOrchestratorIntegrationService_1 = class PolicyOrchestratorIntegrationService {
    constructor(policyService) {
        this.policyService = policyService;
        this.logger = new common_1.Logger(PolicyOrchestratorIntegrationService_1.name);
    }
    async integrateGatePolicyDecision(request) {
        this.logger.debug(`[PolicyIntegration] GATE_EVAL Policy决策: requestId=${request.request_id}`);
        try {
            const policyResponse = await this.policyService.predict({
                request_id: request.request_id,
                state: request.state,
                model_version: request.model_version,
                experiment_id: request.experiment_id,
            });
            const gateResult = this.convertPolicyToGateResult(policyResponse);
            this.logger.debug(`[PolicyIntegration] GATE_EVAL Policy决策完成: action=${policyResponse.action}`);
            return gateResult;
        }
        catch (error) {
            this.logger.warn(`[PolicyIntegration] GATE_EVAL Policy决策失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return this.getDefaultGateResult();
        }
    }
    async integratePlanGenPolicyDecision(request) {
        this.logger.debug(`[PolicyIntegration] PLAN_GEN Policy决策: requestId=${request.request_id}`);
        try {
            const policyResponse = await this.policyService.predict({
                request_id: request.request_id,
                state: request.state,
                model_version: request.model_version,
                experiment_id: request.experiment_id,
            });
            return {
                should_generate: policyResponse.action === 'ALLOW' || policyResponse.action === 'ADJUST',
                confidence: policyResponse.confidence,
                reasoning: policyResponse.reasoning,
            };
        }
        catch (error) {
            this.logger.warn(`[PolicyIntegration] PLAN_GEN Policy决策失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                should_generate: true,
                confidence: 0.5,
            };
        }
    }
    async integrateVerifyPolicyDecision(request) {
        this.logger.debug(`[PolicyIntegration] VERIFY Policy决策: requestId=${request.request_id}`);
        try {
            const policyResponse = await this.policyService.predict({
                request_id: request.request_id,
                state: request.state,
                model_version: request.model_version,
                experiment_id: request.experiment_id,
            });
            return {
                should_verify: policyResponse.action !== 'REJECT',
                confidence: policyResponse.confidence,
                reasoning: policyResponse.reasoning,
            };
        }
        catch (error) {
            this.logger.warn(`[PolicyIntegration] VERIFY Policy决策失败: ${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                should_verify: true,
                confidence: 0.5,
            };
        }
    }
    convertPolicyToGateResult(policyResponse) {
        let gateResultStatus = 'ALLOW';
        switch (policyResponse.action) {
            case 'REJECT':
                gateResultStatus = 'BLOCK';
                break;
            case 'ADJUST':
                gateResultStatus = 'ADJUST_REQUIRED';
                break;
            case 'CLARIFY':
                gateResultStatus = 'NEED_USER_CONFIRM';
                break;
            case 'ALLOW':
            default:
                gateResultStatus = 'ALLOW';
                break;
        }
        return {
            gate_result: gateResultStatus,
            violations: [],
            required_adjustments: [],
            confidence: policyResponse.confidence,
            evidence_refs: [],
        };
    }
    getDefaultGateResult() {
        return {
            gate_result: 'ALLOW',
            violations: [],
            required_adjustments: [],
            confidence: 0.5,
            evidence_refs: [],
        };
    }
    convertToAction(policyResponse) {
        const actionMap = {
            ALLOW: 'proceed',
            REJECT: 'block',
            ADJUST: 'adjust',
            CLARIFY: 'clarify',
        };
        return {
            action: actionMap[policyResponse.action] || 'proceed',
            params: {
                confidence: policyResponse.confidence,
                reasoning: policyResponse.reasoning,
                model_version: policyResponse.model_version,
                metadata: policyResponse.metadata,
            },
        };
    }
    generateExperimentId(requestId, userId) {
        const hashInput = userId || requestId;
        const hash = this.simpleHash(hashInput);
        return `exp_${hash % 100}`;
    }
    simpleHash(str) {
        let hash = 0;
        for (let i = 0; i < str.length; i++) {
            const char = str.charCodeAt(i);
            hash = (hash << 5) - hash + char;
            hash = hash & hash;
        }
        return Math.abs(hash);
    }
};
exports.PolicyOrchestratorIntegrationService = PolicyOrchestratorIntegrationService;
exports.PolicyOrchestratorIntegrationService = PolicyOrchestratorIntegrationService = PolicyOrchestratorIntegrationService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [policy_service_manager_service_1.PolicyServiceManagerService])
], PolicyOrchestratorIntegrationService);
//# sourceMappingURL=policy-orchestrator-integration.service.js.map