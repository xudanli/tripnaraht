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
var ModelRegistryService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.ModelRegistryService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const mlflow_client_service_1 = require("./mlflow-client.service");
let ModelRegistryService = ModelRegistryService_1 = class ModelRegistryService {
    constructor(configService, mlflowClient) {
        var _a, _b;
        this.configService = configService;
        this.mlflowClient = mlflowClient;
        this.logger = new common_1.Logger(ModelRegistryService_1.name);
        this.mlflowModelName = 'tripnara-policy-model';
        this.registry = new Map();
        this.currentProductionVersion = null;
        this.currentStagingVersion = null;
        this.mlflowTrackingUri =
            ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('MLFLOW_TRACKING_URI')) ||
                process.env.MLFLOW_TRACKING_URI ||
                'http://localhost:5000';
        this.mlflowModelName =
            ((_b = this.configService) === null || _b === void 0 ? void 0 : _b.get('MLFLOW_MODEL_NAME')) ||
                process.env.MLFLOW_MODEL_NAME ||
                'tripnara-policy-model';
        this.logger.log(`[ModelRegistry] MLflow URI: ${this.mlflowTrackingUri}, Model: ${this.mlflowModelName}`);
    }
    async registerModel(modelVersion, evalMetrics) {
        this.logger.log(`[ModelRegistry] 注册模型: version=${modelVersion.version}`);
        try {
            const mlflowModelUri = await this.registerToMLflow(modelVersion, evalMetrics);
            const entry = {
                version: modelVersion.version,
                model_path: modelVersion.model_path,
                mlflow_model_uri: mlflowModelUri,
                training_metrics: modelVersion.training_metrics,
                eval_metrics: evalMetrics || modelVersion.eval_metrics,
                training_config: modelVersion.training_config,
                model_config: modelVersion.model_config,
                dataset_version: modelVersion.dataset_version,
                created_at: modelVersion.created_at,
                is_production: false,
                is_staging: false,
            };
            this.registry.set(modelVersion.version, entry);
            this.logger.log(`[ModelRegistry] 模型已注册: version=${modelVersion.version}, mlflowUri=${mlflowModelUri}`);
            return entry;
        }
        catch (error) {
            this.logger.error(`[ModelRegistry] 注册模型失败: version=${modelVersion.version}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw error;
        }
    }
    async getModelVersion(version) {
        let entry = this.registry.get(version);
        if (!entry) {
            try {
                const mlflowEntry = await this.getFromMLflow(version);
                if (mlflowEntry) {
                    entry = mlflowEntry;
                    this.registry.set(version, entry);
                }
            }
            catch (error) {
                this.logger.warn(`[ModelRegistry] 从MLflow获取模型失败: version=${version}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            }
        }
        return entry;
    }
    async listModelVersions() {
        try {
            const versions = await this.listFromMLflow();
            for (const version of versions) {
                this.registry.set(version.version, version);
            }
            return Array.from(this.registry.values()).sort((a, b) => this.compareVersionNumbers(b.version, a.version));
        }
        catch (error) {
            this.logger.warn(`[ModelRegistry] 从MLflow列出版本失败: error=${error === null || error === void 0 ? void 0 : error.message}`);
            return Array.from(this.registry.values()).sort((a, b) => this.compareVersionNumbers(b.version, a.version));
        }
    }
    async rollbackToVersion(version) {
        this.logger.log(`[ModelRegistry] 回滚到版本: version=${version}`);
        const entry = await this.getModelVersion(version);
        if (!entry) {
            throw new Error(`Model version not found: ${version}`);
        }
        this.currentProductionVersion = version;
        await this.setProductionVersionInMLflow(version);
        this.logger.log(`[ModelRegistry] 已回滚到版本: version=${version}`);
        return entry;
    }
    async setProductionVersion(version) {
        this.logger.log(`[ModelRegistry] 设置生产版本: version=${version}`);
        const entry = await this.getModelVersion(version);
        if (!entry) {
            throw new Error(`Model version not found: ${version}`);
        }
        if (this.currentProductionVersion) {
            const prevEntry = this.registry.get(this.currentProductionVersion);
            if (prevEntry) {
                prevEntry.is_production = false;
            }
        }
        entry.is_production = true;
        this.currentProductionVersion = version;
        await this.setProductionVersionInMLflow(version);
        this.logger.log(`[ModelRegistry] 生产版本已设置: version=${version}`);
    }
    async setStagingVersion(version) {
        this.logger.log(`[ModelRegistry] 设置预发布版本: version=${version}`);
        const entry = await this.getModelVersion(version);
        if (!entry) {
            throw new Error(`Model version not found: ${version}`);
        }
        if (this.currentStagingVersion) {
            const prevEntry = this.registry.get(this.currentStagingVersion);
            if (prevEntry) {
                prevEntry.is_staging = false;
            }
        }
        entry.is_staging = true;
        this.currentStagingVersion = version;
        this.logger.log(`[ModelRegistry] 预发布版本已设置: version=${version}`);
    }
    async compareVersions(version1, version2) {
        var _a, _b;
        const v1 = await this.getModelVersion(version1);
        const v2 = await this.getModelVersion(version2);
        if (!v1 || !v2) {
            throw new Error(`Model version not found: ${!v1 ? version1 : version2}`);
        }
        const trainingMetricsDiff = {};
        const allMetricsKeys = new Set([
            ...Object.keys(v1.training_metrics),
            ...Object.keys(v2.training_metrics),
        ]);
        for (const key of allMetricsKeys) {
            const val1 = v1.training_metrics[key];
            const val2 = v2.training_metrics[key];
            if (typeof val1 === 'number' && typeof val2 === 'number') {
                trainingMetricsDiff[key] = {
                    v1: val1,
                    v2: val2,
                    diff: val2 - val1,
                };
            }
        }
        const evalMetricsDiff = {};
        if (v1.eval_metrics && v2.eval_metrics) {
            const allEvalKeys = new Set([
                ...Object.keys(v1.eval_metrics),
                ...Object.keys(v2.eval_metrics),
            ]);
            for (const key of allEvalKeys) {
                const val1 = ((_a = v1.eval_metrics) === null || _a === void 0 ? void 0 : _a[key]) || 0;
                const val2 = ((_b = v2.eval_metrics) === null || _b === void 0 ? void 0 : _b[key]) || 0;
                evalMetricsDiff[key] = {
                    v1: val1,
                    v2: val2,
                    diff: val2 - val1,
                };
            }
        }
        const trainingConfigDiff = {};
        const config1 = v1.training_config;
        const config2 = v2.training_config;
        const allConfigKeys = new Set([
            ...Object.keys(config1),
            ...Object.keys(config2),
        ]);
        for (const key of allConfigKeys) {
            if (config1[key] !== config2[key]) {
                trainingConfigDiff[key] = {
                    v1: config1[key],
                    v2: config2[key],
                };
            }
        }
        return {
            version1: v1,
            version2: v2,
            differences: {
                training_metrics: trainingMetricsDiff,
                eval_metrics: evalMetricsDiff,
                training_config: trainingConfigDiff,
            },
        };
    }
    getCurrentProductionVersion() {
        return this.currentProductionVersion;
    }
    getCurrentStagingVersion() {
        return this.currentStagingVersion;
    }
    async registerToMLflow(modelVersion, evalMetrics) {
        try {
            const isAvailable = await this.mlflowClient.healthCheck();
            if (!isAvailable) {
                this.logger.warn(`[ModelRegistry] MLflow 服务不可用，使用模拟模式: modelVersion=${modelVersion.version}`);
                return `models:/${this.mlflowModelName}/${modelVersion.version}`;
            }
            const tags = {
                model_version: modelVersion.version,
                dataset_version: modelVersion.dataset_version || 'unknown',
                training_config: JSON.stringify(modelVersion.training_config),
                model_config: JSON.stringify(modelVersion.model_config),
            };
            if (evalMetrics) {
                tags.eval_metrics = JSON.stringify(evalMetrics);
            }
            const result = await this.mlflowClient.createModelVersion(this.mlflowModelName, modelVersion.model_path, modelVersion.mlflow_run_id, tags);
            const modelUri = `models:/${this.mlflowModelName}/${result.model_version.version}`;
            this.logger.log(`[ModelRegistry] 注册到MLflow成功: modelUri=${modelUri}, version=${result.model_version.version}`);
            return modelUri;
        }
        catch (error) {
            this.logger.error(`[ModelRegistry] 注册到MLflow失败: modelVersion=${modelVersion.version}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            return `models:/${this.mlflowModelName}/${modelVersion.version}`;
        }
    }
    async getFromMLflow(version) {
        try {
            const result = await this.mlflowClient.getModelVersion(this.mlflowModelName, version);
            if (!(result === null || result === void 0 ? void 0 : result.model_version)) {
                return null;
            }
            const mv = result.model_version;
            const tags = {};
            if (mv.tags) {
                for (const tag of mv.tags) {
                    tags[tag.key] = tag.value;
                }
            }
            let trainingConfig = {};
            let modelConfig = {};
            let evalMetrics;
            try {
                if (tags.training_config) {
                    trainingConfig = JSON.parse(tags.training_config);
                }
                if (tags.model_config) {
                    modelConfig = JSON.parse(tags.model_config);
                }
                if (tags.eval_metrics) {
                    evalMetrics = JSON.parse(tags.eval_metrics);
                }
            }
            catch (parseError) {
                this.logger.warn(`[ModelRegistry] 解析标签失败: ${parseError === null || parseError === void 0 ? void 0 : parseError.message}`);
            }
            const entry = {
                version: mv.version,
                model_path: mv.source,
                mlflow_model_uri: `models:/${this.mlflowModelName}/${mv.version}`,
                training_metrics: {},
                eval_metrics: evalMetrics,
                training_config: trainingConfig,
                model_config: modelConfig,
                dataset_version: tags.dataset_version || 'unknown',
                created_at: new Date(mv.creation_timestamp).toISOString(),
                is_production: mv.current_stage === 'Production',
                is_staging: mv.current_stage === 'Staging',
            };
            return entry;
        }
        catch (error) {
            this.logger.warn(`[ModelRegistry] 从MLflow获取模型版本失败: version=${version}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            return null;
        }
    }
    async listFromMLflow() {
        try {
            const result = await this.mlflowClient.listModelVersions(this.mlflowModelName, 100);
            const entries = [];
            for (const mv of result.model_versions) {
                const entry = await this.getFromMLflow(mv.version);
                if (entry) {
                    entries.push(entry);
                }
            }
            return entries;
        }
        catch (error) {
            this.logger.warn(`[ModelRegistry] 从MLflow列出版本失败: error=${error === null || error === void 0 ? void 0 : error.message}`);
            return [];
        }
    }
    async setProductionVersionInMLflow(version) {
        try {
            await this.mlflowClient.transitionModelVersionStage(this.mlflowModelName, version, 'Production', true);
            this.logger.log(`[ModelRegistry] 在MLflow中设置生产版本成功: version=${version}`);
        }
        catch (error) {
            this.logger.warn(`[ModelRegistry] 在MLflow中设置生产版本失败: version=${version}, error=${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    compareVersionNumbers(v1, v2) {
        const v1Numbers = v1.replace('v', '').split('.').map(Number);
        const v2Numbers = v2.replace('v', '').split('.').map(Number);
        for (let i = 0; i < 3; i++) {
            if (v1Numbers[i] > v2Numbers[i])
                return 1;
            if (v1Numbers[i] < v2Numbers[i])
                return -1;
        }
        return 0;
    }
};
exports.ModelRegistryService = ModelRegistryService;
exports.ModelRegistryService = ModelRegistryService = ModelRegistryService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService,
        mlflow_client_service_1.MLflowClientService])
], ModelRegistryService);
//# sourceMappingURL=model-registry.service.js.map