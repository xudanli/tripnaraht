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
var RollClientService_1;
Object.defineProperty(exports, "__esModule", { value: true });
exports.RollClientService = void 0;
const common_1 = require("@nestjs/common");
const config_1 = require("@nestjs/config");
const roll_retry_service_1 = require("./roll-retry.service");
const roll_circuit_breaker_service_1 = require("./roll-circuit-breaker.service");
const roll_connection_pool_service_1 = require("./roll-connection-pool.service");
const roll_cache_service_1 = require("./roll-cache.service");
const roll_tracing_service_1 = require("./roll-tracing.service");
let RollClientService = RollClientService_1 = class RollClientService {
    constructor(configService, retryService, circuitBreaker, connectionPool, cache, tracing) {
        this.configService = configService;
        this.retryService = retryService;
        this.circuitBreaker = circuitBreaker;
        this.connectionPool = connectionPool;
        this.cache = cache;
        this.tracing = tracing;
        this.logger = new common_1.Logger(RollClientService_1.name);
        this.enabled =
            this.configService.get('ROLL_ENABLED') !== false;
        this.rayAddress =
            this.configService.get('RAY_ADDRESS') || 'ray://localhost:10001';
        this.rayNamespace =
            this.configService.get('RAY_NAMESPACE') || 'tripnara-rl';
        if (this.enabled) {
            this.initializeRayClient();
        }
        else {
            this.logger.warn('[RollClient] ROLL 未启用，使用本地模拟模式');
        }
    }
    async initializeRayClient() {
        try {
            this.logger.log(`[RollClient] 初始化 Ray Client: ${this.rayAddress}`);
        }
        catch (error) {
            this.logger.error(`[RollClient] Ray Client 初始化失败: ${error.message}`, error.stack);
            this.enabled = false;
        }
    }
    async callActorWorker(request) {
        if (!this.enabled) {
            return this.simulateActorWorker(request);
        }
        try {
            const rayRequest = {
                request_id: request.requestId,
                user_request: request.userRequest,
                state: request.state || {},
                action: request.action,
                params: request.params,
                timestamp: request.timestamp || new Date().toISOString(),
            };
            const response = await this.callRayActor('ActorWorker', 'generate_trajectory', rayRequest);
            return {
                success: response.success !== false,
                trajectoryId: response.trajectory_id,
                trajectoryRef: response.trajectory_ref,
                trajectory: response.trajectory,
                error: response.error,
            };
        }
        catch (error) {
            this.logger.error(`[RollClient] Actor-Worker 调用失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async callRewardWorker(trajectoryRef, rewardConfig) {
        if (!this.enabled) {
            return this.simulateRewardWorker(trajectoryRef);
        }
        try {
            const response = await this.callRayActor('RewardWorker', 'compute_reward', trajectoryRef, rewardConfig);
            return {
                success: response.success !== false,
                reward: response.reward,
                rawReward: response.raw_reward,
                rewardBreakdown: response.reward_breakdown,
                error: response.error,
            };
        }
        catch (error) {
            this.logger.error(`[RollClient] Reward-Worker 调用失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async callPolicyWorker(state) {
        if (!this.enabled) {
            return this.simulatePolicyWorker(state);
        }
        try {
            const response = await this.callRayActor('PolicyWorker', 'predict', state);
            return {
                success: response.success !== false,
                action: response.action,
                confidence: response.confidence,
                reasoning: response.reasoning,
                adjustedParams: response.adjusted_params,
                error: response.error,
            };
        }
        catch (error) {
            this.logger.error(`[RollClient] Policy-Worker 调用失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async startTraining(config) {
        if (!this.enabled) {
            return this.simulateTraining(config);
        }
        try {
            const response = await this.callBridgeService('/api/training/start', 'POST', {
                job_id: config.jobId,
                model_type: config.modelType,
                base_model: config.baseModel,
                training_data: config.trainingData,
                hyperparameters: config.hyperparameters || {},
            });
            return {
                success: response.success !== false,
                rayJobId: response.ray_job_id,
                mlflowRunId: response.mlflow_run_id,
                status: response.status,
                error: response.error,
            };
        }
        catch (error) {
            this.logger.error(`[RollClient] 训练任务启动失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async getTrainingStatus(rayJobId) {
        if (!this.enabled) {
            return {
                success: false,
                error: 'ROLL 未启用',
            };
        }
        try {
            const response = await this.callBridgeService(`/api/training/status/${rayJobId}`, 'GET');
            return {
                success: response.success !== false,
                status: response.status,
                progress: response.progress,
                metrics: response.metrics,
                error: response.error,
            };
        }
        catch (error) {
            this.logger.error(`[RollClient] 查询训练状态失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async cancelTraining(rayJobId) {
        if (!this.enabled) {
            return {
                success: false,
                error: 'ROLL 未启用',
            };
        }
        try {
            const response = await this.callBridgeService(`/api/training/cancel/${rayJobId}`, 'POST');
            return {
                success: response.success !== false,
                status: response.status,
                error: response.error,
            };
        }
        catch (error) {
            this.logger.error(`[RollClient] 取消训练任务失败: ${error.message}`, error.stack);
            return {
                success: false,
                error: error.message,
            };
        }
    }
    async callBridgeService(endpoint, method = 'POST', body, useCache = false, parentSpanContext) {
        var _a;
        const bridgeUrl = this.connectionPool
            ? this.connectionPool.getBridgeUrl()
            : this.configService.get('ROLL_BRIDGE_URL') || 'http://localhost:8001';
        const spanContext = this.tracing
            ? this.tracing.startSpan(`roll.bridge.${endpoint}`, parentSpanContext, {
                'http.method': method,
                'http.url': endpoint,
                'service.name': 'roll-client',
            })
            : undefined;
        try {
            if (useCache && method === 'GET' && this.cache) {
                const cacheKey = `${endpoint}:${JSON.stringify(body || {})}`;
                const cached = this.cache.get('bridge', cacheKey);
                if (cached !== null) {
                    this.logger.debug(`[RollClient] 缓存命中: ${endpoint}`);
                    if (spanContext) {
                        this.tracing.endSpan(spanContext.spanId, 'ok', undefined, {
                            'cache.hit': true,
                        });
                    }
                    return cached;
                }
            }
            const operation = async () => {
                const headers = {
                    'Content-Type': 'application/json',
                };
                if (spanContext && this.tracing) {
                    this.tracing.injectTraceContext(headers, spanContext);
                }
                const fetchOptions = {
                    method,
                    headers,
                    body: body ? JSON.stringify(body) : undefined,
                    signal: AbortSignal.timeout(10000),
                };
                const response = await fetch(`${bridgeUrl}${endpoint}`, fetchOptions);
                if (!response.ok) {
                    const errorData = await response.json().catch(() => ({
                        detail: response.statusText,
                    }));
                    const httpError = new Error(errorData.detail || `HTTP ${response.status}`);
                    httpError.status = response.status;
                    throw httpError;
                }
                const result = await response.json();
                if (useCache && method === 'GET' && this.cache) {
                    const cacheKey = `${endpoint}:${JSON.stringify(body || {})}`;
                    this.cache.set('bridge', cacheKey, result, 300000);
                }
                return result;
            };
            const protectedOperation = this.circuitBreaker
                ? () => this.circuitBreaker.execute(operation, endpoint)
                : operation;
            let result;
            if (this.retryService) {
                result = await this.retryService.executeWithRetry(protectedOperation, `BridgeService:${endpoint}`);
            }
            else {
                try {
                    result = await protectedOperation();
                }
                catch (error) {
                    this.logger.error(`[RollClient] Bridge Service 调用失败: ${error.message}`, error.stack);
                    throw error;
                }
            }
            if (spanContext) {
                this.tracing.endSpan(spanContext.spanId, 'ok', undefined, {
                    'http.status_code': 200,
                });
            }
            return result;
        }
        catch (error) {
            if (spanContext) {
                this.tracing.endSpan(spanContext.spanId, 'error', { message: error.message, code: (_a = error.status) === null || _a === void 0 ? void 0 : _a.toString() }, {
                    'http.status_code': error.status || 500,
                    'error': true,
                });
            }
            throw error;
        }
    }
    async callRayActor(actorName, methodName, ...args) {
        if (actorName === 'ActorWorker' && methodName === 'generate_trajectory') {
            return this.callBridgeService('/api/actor/generate-trajectory', 'POST', args[0]);
        }
        else if (actorName === 'RewardWorker' && methodName === 'compute_reward') {
            return this.callBridgeService('/api/reward/compute', 'POST', {
                trajectory: args[0],
                reward_config: args[1],
            });
        }
        else if (actorName === 'PolicyWorker' && methodName === 'predict') {
            return this.callBridgeService('/api/policy/predict', 'POST', args[0]);
        }
        throw new Error(`Unknown actor/method: ${actorName}.${methodName}`);
    }
    simulateActorWorker(request) {
        this.logger.debug('[RollClient] 使用本地模拟: Actor-Worker');
        return {
            success: true,
            trajectoryId: `local_traj_${request.requestId}`,
            trajectory: {
                trajectory_id: `local_traj_${request.requestId}`,
                steps: [
                    {
                        step: 0,
                        state: { user_request: request.userRequest },
                        action: { action: request.action },
                        reward: 0.0,
                        next_state: request.state || {},
                    },
                ],
            },
        };
    }
    simulateRewardWorker(trajectoryRef) {
        this.logger.debug('[RollClient] 使用本地模拟: Reward-Worker');
        return {
            success: true,
            reward: 0.7,
            rawReward: 0.7,
            rewardBreakdown: [],
        };
    }
    simulatePolicyWorker(state) {
        this.logger.debug('[RollClient] 使用本地模拟: Policy-Worker');
        return {
            success: true,
            action: 'ALLOW',
            confidence: 0.8,
            reasoning: '模拟策略推理',
        };
    }
    simulateTraining(config) {
        this.logger.debug('[RollClient] 使用本地模拟: Training');
        return {
            success: true,
            rayJobId: `local_job_${config.jobId}`,
            mlflowRunId: `mlflow_local_${Date.now()}`,
        };
    }
    async healthCheck() {
        var _a, _b, _c;
        if (!this.enabled) {
            return {
                status: 'disabled',
                rayConnected: false,
                workersAvailable: [],
            };
        }
        try {
            const health = await this.callBridgeService('/health', 'GET');
            const workersStatus = await this.callBridgeService('/api/workers/status', 'GET');
            const availableWorkers = [];
            if (((_a = workersStatus.actor_workers) === null || _a === void 0 ? void 0 : _a.length) > 0) {
                availableWorkers.push('ActorWorker');
            }
            if (((_b = workersStatus.reward_workers) === null || _b === void 0 ? void 0 : _b.length) > 0) {
                availableWorkers.push('RewardWorker');
            }
            if (((_c = workersStatus.policy_workers) === null || _c === void 0 ? void 0 : _c.length) > 0) {
                availableWorkers.push('PolicyWorker');
            }
            return {
                status: health.status || 'unknown',
                rayConnected: health.ray_connected || false,
                workersAvailable: availableWorkers,
            };
        }
        catch (error) {
            this.logger.warn(`[RollClient] 健康检查失败: ${error.message}`);
            return {
                status: 'unhealthy',
                rayConnected: false,
                workersAvailable: [],
            };
        }
    }
};
exports.RollClientService = RollClientService;
exports.RollClientService = RollClientService = RollClientService_1 = __decorate([
    (0, common_1.Injectable)(),
    __param(1, (0, common_1.Optional)()),
    __param(2, (0, common_1.Optional)()),
    __param(3, (0, common_1.Optional)()),
    __param(4, (0, common_1.Optional)()),
    __param(5, (0, common_1.Optional)()),
    __metadata("design:paramtypes", [config_1.ConfigService,
        roll_retry_service_1.RollRetryService,
        roll_circuit_breaker_service_1.RollCircuitBreakerService,
        roll_connection_pool_service_1.RollConnectionPoolService,
        roll_cache_service_1.RollCacheService,
        roll_tracing_service_1.RollTracingService])
], RollClientService);
//# sourceMappingURL=roll-client.service.js.map