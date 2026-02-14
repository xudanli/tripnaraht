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
var PolicyServiceManagerService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PolicyServiceManagerService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const model_registry_service_1 = require("./model-registry.service");
const roll_policy_adapter_service_1 = require("./roll-policy-adapter.service");
let PolicyServiceManagerService = PolicyServiceManagerService_1 = class PolicyServiceManagerService {
    constructor(configService, modelRegistry, rollPolicyAdapter) {
        this.configService = configService;
        this.modelRegistry = modelRegistry;
        this.rollPolicyAdapter = rollPolicyAdapter;
        this.logger = new common_1.Logger(PolicyServiceManagerService_1.name);
        this.fallbackEnabled = true;
        this.policyServiceUrl =
            this.configService.get('POLICY_SERVICE_URL') ||
                'http://localhost:8002';
        this.fallbackEnabled =
            this.configService.get('POLICY_SERVICE_FALLBACK_ENABLED') !==
                false;
    }
    async predict(request, useFallback = true) {
        this.logger.debug(`[PolicyService] 策略推理: requestId=${request.request_id}, modelVersion=${request.model_version}`);
        if (this.rollPolicyAdapter) {
            try {
                const rollResult = await this.rollPolicyAdapter.predict(request);
                this.logger.debug(`[PolicyService] 使用 ROLL Policy-Worker 推理完成: requestId=${request.request_id}, action=${rollResult.action}`);
                return rollResult;
            }
            catch (error) {
                this.logger.warn(`[PolicyService] ROLL Policy-Worker 调用失败，回退到 PolicyService: ${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        try {
            const response = await fetch(`${this.policyServiceUrl}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(request),
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                throw new Error(`PolicyService error: ${response.statusText}`);
            }
            const result = (await response.json());
            this.logger.debug(`[PolicyService] 推理完成: requestId=${request.request_id}, action=${result.action}, latency=${result.latency_ms}ms`);
            return result;
        }
        catch (error) {
            this.logger.warn(`[PolicyService] 推理失败: requestId=${request.request_id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            if (useFallback && this.fallbackEnabled) {
                return await this.predictWithFallback(request);
            }
            throw error;
        }
    }
    async predictWithFallback(request) {
        this.logger.log(`[PolicyService] 使用fallback模型: requestId=${request.request_id}`);
        const fallbackVersion = await this.getFallbackModelVersion();
        if (!fallbackVersion) {
            throw new Error('No fallback model available');
        }
        const fallbackRequest = {
            ...request,
            model_version: fallbackVersion,
        };
        try {
            const response = await fetch(`${this.policyServiceUrl}/predict`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify(fallbackRequest),
                signal: AbortSignal.timeout(5000),
            });
            if (!response.ok) {
                throw new Error(`PolicyService fallback error: ${response.statusText}`);
            }
            const result = (await response.json());
            result.metadata = {
                ...result.metadata,
                fallback_used: true,
                original_model_version: request.model_version,
            };
            this.logger.log(`[PolicyService] Fallback推理成功: requestId=${request.request_id}, fallbackVersion=${fallbackVersion}`);
            return result;
        }
        catch (error) {
            this.logger.error(`[PolicyService] Fallback推理失败: requestId=${request.request_id}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async healthCheck() {
        try {
            const response = await fetch(`${this.policyServiceUrl}/health`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
            });
            if (!response.ok) {
                return {
                    status: 'unhealthy',
                    model_loaded: false,
                    qps: 0,
                    p95_latency_ms: 0,
                    error_rate: 1.0,
                    uptime_seconds: 0,
                };
            }
            const health = (await response.json());
            return health;
        }
        catch (error) {
            this.logger.warn(`[PolicyService] 健康检查失败: error=${error === null || error === void 0 ? void 0 : error.message}`);
            return {
                status: 'unhealthy',
                model_loaded: false,
                qps: 0,
                p95_latency_ms: 0,
                error_rate: 1.0,
                uptime_seconds: 0,
            };
        }
    }
    async getMetrics() {
        try {
            const response = await fetch(`${this.policyServiceUrl}/metrics`, {
                method: 'GET',
                signal: AbortSignal.timeout(3000),
            });
            if (!response.ok) {
                throw new Error(`PolicyService metrics error: ${response.statusText}`);
            }
            const metrics = (await response.json());
            return metrics;
        }
        catch (error) {
            this.logger.warn(`[PolicyService] 获取指标失败: error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async deployModel(modelVersion) {
        this.logger.log(`[PolicyService] 部署模型: modelVersion=${modelVersion}`);
        const modelEntry = await this.modelRegistry.getModelVersion(modelVersion);
        if (!modelEntry) {
            throw new Error(`Model version not found: ${modelVersion}`);
        }
        try {
            const response = await fetch(`${this.policyServiceUrl}/deploy`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model_version: modelVersion,
                    model_path: modelEntry.model_path,
                    mlflow_model_uri: modelEntry.mlflow_model_uri,
                }),
            });
            if (!response.ok) {
                throw new Error(`PolicyService deploy error: ${response.statusText}`);
            }
            this.logger.log(`[PolicyService] 模型已部署: modelVersion=${modelVersion}`);
        }
        catch (error) {
            this.logger.error(`[PolicyService] 部署模型失败: modelVersion=${modelVersion}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async rollbackModel(targetVersion) {
        this.logger.log(`[PolicyService] 回滚模型: targetVersion=${targetVersion}`);
        await this.modelRegistry.rollbackToVersion(targetVersion);
        await this.deployModel(targetVersion);
        this.logger.log(`[PolicyService] 模型已回滚: targetVersion=${targetVersion}`);
    }
    async getFallbackModelVersion() {
        const productionVersion = this.modelRegistry.getCurrentProductionVersion();
        if (productionVersion) {
            return productionVersion;
        }
        const versions = await this.modelRegistry.listModelVersions();
        if (versions.length > 0) {
            return versions[0].version;
        }
        return null;
    }
};
exports.PolicyServiceManagerService = PolicyServiceManagerService;
exports.PolicyServiceManagerService = PolicyServiceManagerService = PolicyServiceManagerService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(2, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        model_registry_service_1.ModelRegistryService,
        roll_policy_adapter_service_1.RollPolicyAdapterService])
], PolicyServiceManagerService);
//# sourceMappingURL=policy-service-manager.service.js.map