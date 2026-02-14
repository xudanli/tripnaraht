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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var MLflowClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.MLflowClientService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
let MLflowClientService = MLflowClientService_1 = class MLflowClientService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(MLflowClientService_1.name);
        this.mlflowTrackingUri =
            ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('MLFLOW_TRACKING_URI')) ||
                process.env.MLFLOW_TRACKING_URI ||
                'http://localhost:5000';
        this.httpClient = axios_1.default.create({
            baseURL: this.mlflowTrackingUri,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
            },
        });
        this.logger.log(`[MLflowClient] 初始化: trackingUri=${this.mlflowTrackingUri}`);
    }
    async createModelVersion(modelName, source, runId, tags) {
        try {
            const response = await this.httpClient.post('/api/2.0/mlflow/model-versions/create', {
                name: modelName,
                source,
                run_id: runId,
                tags: tags ? Object.entries(tags).map(([key, value]) => ({ key, value })) : undefined,
            });
            this.logger.debug(`[MLflowClient] 创建模型版本成功: modelName=${modelName}, version=${response.data.model_version.version}`);
            return response.data;
        }
        catch (error) {
            this.logger.error(`[MLflowClient] 创建模型版本失败: modelName=${modelName}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw new Error(`MLflow API 错误: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    async getModelVersion(modelName, version) {
        var _a;
        try {
            const response = await this.httpClient.get('/api/2.0/mlflow/model-versions/get', {
                params: {
                    name: modelName,
                    version,
                },
            });
            return response.data;
        }
        catch (error) {
            if (((_a = error.response) === null || _a === void 0 ? void 0 : _a.status) === 404) {
                return null;
            }
            this.logger.error(`[MLflowClient] 获取模型版本失败: modelName=${modelName}, version=${version}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw new Error(`MLflow API 错误: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    async listModelVersions(modelName, maxResults = 100) {
        try {
            const response = await this.httpClient.get('/api/2.0/mlflow/model-versions/search', {
                params: {
                    name: modelName,
                    max_results: maxResults,
                },
            });
            return response.data;
        }
        catch (error) {
            this.logger.error(`[MLflowClient] 列出模型版本失败: modelName=${modelName}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            return { model_versions: [] };
        }
    }
    async transitionModelVersionStage(modelName, version, stage, archiveExistingVersions = false) {
        try {
            await this.httpClient.post('/api/2.0/mlflow/model-versions/transition-stage', {
                name: modelName,
                version,
                stage,
                archive_existing_versions: archiveExistingVersions,
            });
            this.logger.log(`[MLflowClient] 更新模型版本阶段成功: modelName=${modelName}, version=${version}, stage=${stage}`);
        }
        catch (error) {
            this.logger.error(`[MLflowClient] 更新模型版本阶段失败: modelName=${modelName}, version=${version}, stage=${stage}, error=${error === null || error === void 0 ? void 0 : error.message}`);
            throw new Error(`MLflow API 错误: ${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    async getOrCreateExperiment(experimentName) {
        var _a, _b, _c, _d;
        try {
            const getResponse = await this.httpClient.get('/api/2.0/mlflow/experiments/get-by-name', {
                params: {
                    experiment_name: experimentName,
                },
            });
            if ((_b = (_a = getResponse.data) === null || _a === void 0 ? void 0 : _a.experiment) === null || _b === void 0 ? void 0 : _b.experiment_id) {
                return getResponse.data.experiment.experiment_id;
            }
        }
        catch (error) {
            if (((_c = error.response) === null || _c === void 0 ? void 0 : _c.status) === 404 || ((_d = error.response) === null || _d === void 0 ? void 0 : _d.status) === 400) {
                try {
                    const createResponse = await this.httpClient.post('/api/2.0/mlflow/experiments/create', {
                        name: experimentName,
                    });
                    return createResponse.data.experiment_id;
                }
                catch (createError) {
                    this.logger.error(`[MLflowClient] 创建实验失败: experimentName=${experimentName}, error=${createError === null || createError === void 0 ? void 0 : createError.message}`);
                    throw new Error(`MLflow API 错误: ${createError === null || createError === void 0 ? void 0 : createError.message}`);
                }
            }
        }
        throw new Error(`无法获取或创建实验: ${experimentName}`);
    }
    async logMetrics(runId, metrics, step, timestamp) {
        try {
            const metricsArray = Object.entries(metrics).map(([key, value]) => ({
                key,
                value,
                step: step || 0,
                timestamp: timestamp || Date.now(),
            }));
            await this.httpClient.post('/api/2.0/mlflow/runs/log-batch', {
                run_id: runId,
                metrics: metricsArray,
            });
            this.logger.debug(`[MLflowClient] 记录指标成功: runId=${runId}, metricsCount=${metricsArray.length}`);
        }
        catch (error) {
            this.logger.warn(`[MLflowClient] 记录指标失败: runId=${runId}, error=${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    async logParams(runId, params) {
        try {
            const paramsArray = Object.entries(params).map(([key, value]) => ({
                key,
                value: String(value),
            }));
            await this.httpClient.post('/api/2.0/mlflow/runs/log-batch', {
                run_id: runId,
                params: paramsArray,
            });
            this.logger.debug(`[MLflowClient] 记录参数成功: runId=${runId}, paramsCount=${paramsArray.length}`);
        }
        catch (error) {
            this.logger.warn(`[MLflowClient] 记录参数失败: runId=${runId}, error=${error === null || error === void 0 ? void 0 : error.message}`);
        }
    }
    async healthCheck() {
        try {
            const response = await this.httpClient.get('/health', { timeout: 5000 });
            return response.status === 200;
        }
        catch (error) {
            this.logger.warn(`[MLflowClient] MLflow 服务不可用: ${error === null || error === void 0 ? void 0 : error.message}`);
            return false;
        }
    }
};
exports.MLflowClientService = MLflowClientService;
exports.MLflowClientService = MLflowClientService = MLflowClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(0, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService])
], MLflowClientService);
//# sourceMappingURL=mlflow-client.service.js.map