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
var FallbackStrategyService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.FallbackStrategyService = void 0;
const common_1 = require("@nestjs/common");
const policy_service_manager_service_1 = require("./policy-service-manager.service");
const model_registry_service_1 = require("./model-registry.service");
let FallbackStrategyService = FallbackStrategyService_1 = class FallbackStrategyService {
    constructor(policyService, modelRegistry) {
        this.policyService = policyService;
        this.modelRegistry = modelRegistry;
        this.logger = new common_1.Logger(FallbackStrategyService_1.name);
    }
    async executeWithFallback(operation, fallbackOperation) {
        try {
            return await operation();
        }
        catch (error) {
            this.logger.warn(`[FallbackStrategy] 主操作失败，尝试降级: ${error === null || error === void 0 ? void 0 : error.message}`);
            if (fallbackOperation) {
                try {
                    return await fallbackOperation();
                }
                catch (fallbackError) {
                    this.logger.error(`[FallbackStrategy] 降级操作也失败: ${fallbackError === null || fallbackError === void 0 ? void 0 : fallbackError.message}`);
                    throw fallbackError;
                }
            }
            throw error;
        }
    }
    async getBaselineModelVersion() {
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
    async getFallbackModelVersion(currentVersion) {
        const versions = await this.modelRegistry.listModelVersions();
        const currentIndex = versions.findIndex((v) => v.version === currentVersion);
        if (currentIndex > 0) {
            return versions[currentIndex - 1].version;
        }
        return await this.getBaselineModelVersion();
    }
};
exports.FallbackStrategyService = FallbackStrategyService;
exports.FallbackStrategyService = FallbackStrategyService = FallbackStrategyService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [policy_service_manager_service_1.PolicyServiceManagerService,
        model_registry_service_1.ModelRegistryService])
], FallbackStrategyService);
//# sourceMappingURL=fallback-strategy.service.js.map