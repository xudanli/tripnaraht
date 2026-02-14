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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var PythonAIService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.PythonAIService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const axios_1 = __importDefault(require("axios"));
const https_1 = __importDefault(require("https"));
const circuit_breaker_1 = require("../utils/circuit-breaker");
const retry_with_backoff_1 = require("../utils/retry-with-backoff");
let PythonAIService = PythonAIService_1 = class PythonAIService {
    constructor(configService) {
        var _a;
        this.configService = configService;
        this.logger = new common_1.Logger(PythonAIService_1.name);
        this.isHealthy = false;
        this.baseUrl = this.configService.get('PYTHON_AI_SERVICE_URL') || 'http://localhost:8001';
        this.timeout = this.configService.get('PYTHON_AI_SERVICE_TIMEOUT') || 30000;
        this.healthCheckTimeout = this.configService.get('PYTHON_AI_SERVICE_HEALTH_TIMEOUT') || 15000;
        this.enabled = this.configService.get('PYTHON_AI_SERVICE_ENABLED') !== 'false';
        const disableProxy = ((_a = this.configService) === null || _a === void 0 ? void 0 : _a.get('PYTHON_AI_DISABLE_PROXY')) === 'true' || true;
        this.http = axios_1.default.create({
            baseURL: this.baseUrl,
            timeout: this.timeout,
            headers: {
                'Content-Type': 'application/json',
            },
            proxy: false,
            httpsAgent: new https_1.default.Agent({
                keepAlive: true,
                family: 4,
            }),
        });
        this.circuitBreaker = new circuit_breaker_1.CircuitBreaker('PythonAIService', {
            failureThreshold: 5,
            resetTimeoutMs: 30000,
            halfOpenMaxCalls: 2,
        });
        this.logger.log(`Python AI Service 配置: baseUrl=${this.baseUrl}, enabled=${this.enabled}, proxy=${disableProxy ? 'disabled' : 'enabled'}`);
    }
    async onModuleInit() {
        if (!this.enabled) {
            this.logger.warn('Python AI Service 已禁用');
            return;
        }
        const maxRetries = 3;
        let lastError = null;
        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                const health = await this.checkHealth();
                this.logger.log(`✅ Python AI Service 连接成功 (尝试 ${attempt}/${maxRetries})`);
                const logParts = [
                    `状态: ${health.status}`,
                    `版本: ${health.version || 'unknown'}`,
                ];
                if (health.service) {
                    logParts.push(`服务: ${health.service}`);
                }
                if (health.gpu_available !== undefined) {
                    logParts.push(`GPU: ${health.gpu_available ? '可用' : '不可用'}`);
                }
                else {
                    logParts.push(`GPU: 未报告`);
                }
                if (health.models) {
                    const modelInfo = [];
                    if (health.models.embedding)
                        modelInfo.push(`Embedding: ${health.models.embedding}`);
                    if (health.models.reranker)
                        modelInfo.push(`Reranker: ${health.models.reranker}`);
                    if (modelInfo.length > 0) {
                        logParts.push(`模型: ${modelInfo.join(', ')}`);
                    }
                }
                this.logger.debug(`服务详情: ${logParts.join(' | ')}`);
                return;
            }
            catch (error) {
                lastError = error;
                if (attempt < maxRetries) {
                    this.logger.debug(`健康检查失败 (尝试 ${attempt}/${maxRetries}): ${error.message}，${2}秒后重试...`);
                    await new Promise(resolve => setTimeout(resolve, 2000));
                }
            }
        }
        this.logger.warn(`⚠️ Python AI Service 连接失败 (已重试 ${maxRetries} 次): ${lastError === null || lastError === void 0 ? void 0 : lastError.message}，将使用 OpenAI 降级`);
        this.logger.warn(`提示: 请检查服务地址 ${this.baseUrl} 是否可访问，或增加 PYTHON_AI_SERVICE_HEALTH_TIMEOUT`);
    }
    isAvailable() {
        return this.enabled && this.isHealthy && !this.circuitBreaker.isOpen();
    }
    getServiceStatus() {
        return {
            enabled: this.enabled,
            healthy: this.isHealthy,
            baseUrl: this.baseUrl,
            circuitBreakerState: this.circuitBreaker.getState(),
            isAvailable: this.isAvailable(),
        };
    }
    async checkHealth() {
        var _a;
        try {
            const response = await this.http.get('/health', {
                timeout: this.healthCheckTimeout,
            });
            this.isHealthy = response.data.status === 'healthy';
            return response.data;
        }
        catch (error) {
            this.isHealthy = false;
            if (error.code === 'ECONNABORTED' || ((_a = error.message) === null || _a === void 0 ? void 0 : _a.includes('timeout'))) {
                throw new Error(`Health check timeout (${this.healthCheckTimeout}ms): service may be slow or unreachable`);
            }
            else if (error.code === 'ECONNREFUSED') {
                throw new Error(`Connection refused: service may not be running at ${this.baseUrl}`);
            }
            else if (error.code === 'ENOTFOUND' || error.code === 'EAI_AGAIN') {
                throw new Error(`DNS resolution failed: cannot resolve hostname`);
            }
            else {
                throw new Error(`Health check failed: ${error.message || error.code || 'Unknown error'}`);
            }
        }
    }
    async generateEmbeddings(texts, options = {}) {
        var _a, _b, _c, _d;
        if (!this.enabled) {
            throw new Error('Python AI Service is disabled');
        }
        if (this.circuitBreaker.isOpen()) {
            throw new Error('Python AI Service circuit breaker is open');
        }
        const request = {
            texts,
            model: 'bge-m3',
            encoding_format: 'float',
            return_sparse: (_a = options.returnSparse) !== null && _a !== void 0 ? _a : false,
            return_colbert: (_b = options.returnColbert) !== null && _b !== void 0 ? _b : false,
        };
        try {
            const response = await (0, retry_with_backoff_1.retryWithBackoff)(() => this.http.post('/api/v1/embeddings', request), {
                maxRetries: 3,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                factor: 2,
                jitter: true,
            });
            this.circuitBreaker.recordSuccess();
            if (!this.isHealthy) {
                this.isHealthy = true;
                this.logger.log('✅ Python AI Service 已恢复连接');
            }
            this.logger.debug(`✅ Embedding 生成成功: ${texts.length} 条文本，维度: ${((_d = (_c = response.data.embeddings[0]) === null || _c === void 0 ? void 0 : _c.dense) === null || _d === void 0 ? void 0 : _d.length) || 'unknown'}`);
            return response.data.embeddings;
        }
        catch (error) {
            this.circuitBreaker.recordFailure();
            this.handleError(error, 'generateEmbeddings');
            throw error;
        }
    }
    async generateEmbedding(text, options = {}) {
        const results = await this.generateEmbeddings([text], options);
        return results[0].dense;
    }
    async rerank(query, documents, topK = 10) {
        if (!this.enabled) {
            throw new Error('Python AI Service is disabled');
        }
        if (this.circuitBreaker.isOpen()) {
            throw new Error('Python AI Service circuit breaker is open');
        }
        const request = {
            query,
            documents,
            top_k: topK,
            model: 'bge-reranker-v2-m3',
        };
        try {
            const response = await (0, retry_with_backoff_1.retryWithBackoff)(() => this.http.post('/api/v1/rerank', request), {
                maxRetries: 3,
                initialDelayMs: 100,
                maxDelayMs: 1000,
                factor: 2,
                jitter: true,
            });
            this.circuitBreaker.recordSuccess();
            this.logger.debug(`✅ Rerank 成功: ${documents.length} 条文档 -> top ${topK}`);
            return response.data.results;
        }
        catch (error) {
            this.circuitBreaker.recordFailure();
            this.handleError(error, 'rerank');
            throw error;
        }
    }
    async createBatchEmbeddingTask(texts, batchSize = 32, callbackUrl) {
        if (!this.enabled) {
            throw new Error('Python AI Service is disabled');
        }
        try {
            const response = await this.http.post('/api/v1/embeddings/batch', {
                texts,
                batch_size: batchSize,
                callback_url: callbackUrl,
            });
            this.logger.log(`📤 批量 Embedding 任务已创建: ${response.data.task_id}`);
            return response.data.task_id;
        }
        catch (error) {
            this.handleError(error, 'createBatchEmbeddingTask');
            throw error;
        }
    }
    async getBatchTaskStatus(taskId) {
        try {
            const response = await this.http.get(`/api/v1/embeddings/batch/${taskId}`);
            return response.data;
        }
        catch (error) {
            this.handleError(error, 'getBatchTaskStatus');
            throw error;
        }
    }
    getEmbeddingDimension() {
        return 1024;
    }
    getCircuitBreakerState() {
        return this.circuitBreaker.getState();
    }
    handleError(error, method) {
        const isAxiosError = axios_1.default.isAxiosError(error);
        if (isAxiosError) {
            const axiosError = error;
            if (axiosError.response) {
                this.logger.error(`[${method}] Python AI Service error: ${axiosError.response.status} - ${JSON.stringify(axiosError.response.data)}`);
            }
            else if (axiosError.request) {
                this.logger.error(`[${method}] Python AI Service no response: ${axiosError.message}`);
                this.isHealthy = false;
            }
            else {
                this.logger.error(`[${method}] Python AI Service request error: ${axiosError.message}`);
            }
        }
        else {
            this.logger.error(`[${method}] Python AI Service error: ${error.message}`);
        }
    }
};
exports.PythonAIService = PythonAIService;
exports.PythonAIService = PythonAIService = PythonAIService_1 = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [config_1.ConfigService])
], PythonAIService);
//# sourceMappingURL=python-ai.service.js.map