// src/agent/training/services/roll-client.service.ts

import { Injectable, Logger, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { RollRetryService } from './roll-retry.service';
import { RollCircuitBreakerService } from './roll-circuit-breaker.service';
import { RollConnectionPoolService } from './roll-connection-pool.service';
import { RollCacheService } from './roll-cache.service';
import { RollTracingService, SpanContext } from './roll-tracing.service';

/**
 * RollClientService: TypeScript → Ray API 桥接服务
 *
 * 职责:
 * 1. 封装 Ray Client API 调用
 * 2. 管理 Worker 连接
 * 3. 错误处理和重试
 * 4. 连接池和负载均衡
 */
@Injectable()
export class RollClientService {
  private readonly logger = new Logger(RollClientService.name);
  private enabled: boolean;
  private readonly strictMode: boolean;
  private readonly allowSimulation: boolean;
  private readonly rayAddress: string;
  private readonly rayNamespace: string;
  private readonly bridgeTimeoutMs: number;
  private rayClient: any; // Ray Client (需要安装 @ray-project/ray)

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly retryService?: RollRetryService,
    @Optional() private readonly circuitBreaker?: RollCircuitBreakerService,
    @Optional() private readonly connectionPool?: RollConnectionPoolService,
    @Optional() private readonly cache?: RollCacheService,
    @Optional() private readonly tracing?: RollTracingService,
  ) {
    this.enabled =
      this.configService.get<boolean>('ROLL_ENABLED') !== false;
    this.strictMode = this.getEnvFlag('ROLL_STRICT_MODE', false);
    this.allowSimulation = this.getEnvFlag('ROLL_ALLOW_SIMULATION', true);
    this.rayAddress =
      this.configService.get<string>('RAY_ADDRESS') || 'ray://localhost:10001';
    this.rayNamespace =
      this.configService.get<string>('RAY_NAMESPACE') || 'tripnara-rl';
    this.bridgeTimeoutMs = Number(
      this.configService.get<string>('ROLL_BRIDGE_TIMEOUT_MS') || '10000',
    );

    if (this.enabled) {
      this.initializeRayClient();
    } else {
      if (this.isSimulationAllowed()) {
        this.logger.warn('[RollClient] ROLL 未启用，使用本地模拟模式');
      } else {
        this.logger.error(
          '[RollClient] ROLL 未启用且已禁止模拟（ROLL_ALLOW_SIMULATION=false 或 ROLL_STRICT_MODE=true）',
        );
      }
    }
  }

  /**
   * 初始化 Ray Client
   */
  private async initializeRayClient(): Promise<void> {
    try {
      // 注意: 需要安装 @ray-project/ray 或使用 HTTP API
      // 这里先使用 HTTP API 方式
      this.logger.log(
        `[RollClient] 初始化 Ray Client: ${this.rayAddress}`,
      );
      
      // TODO: 实现 Ray Client 连接
      // 可以使用 Ray 的 HTTP API 或 gRPC API
      // 参考: https://docs.ray.io/en/latest/ray-core/package-ref.html#ray-client
      
    } catch (error: any) {
      this.logger.error(
        `[RollClient] Ray Client 初始化失败: ${error.message}`,
        error.stack,
      );
      this.enabled = false;
    }
  }

  /**
   * 调用 Actor-Worker 生成轨迹
   */
  async callActorWorker(request: {
    requestId: string;
    userRequest: string;
    state?: Record<string, any>;
    action: string;
    params: Record<string, any>;
    timestamp?: string;
  }): Promise<{
    success: boolean;
    trajectoryId?: string;
    trajectoryRef?: any; // Ray ObjectRef (序列化)
    trajectory?: any;
    error?: string;
  }> {
    if (!this.enabled) {
      if (!this.isSimulationAllowed()) {
        this.logger.error('[roll_event] event=simulation_blocked service=actor_worker reason="strict_mode_or_no_simulation"');
        return {
          success: false,
          error: 'ROLL disabled and simulation is forbidden by strict mode',
        };
      }
      return this.simulateActorWorker(request);
    }

    try {
      // 构建请求
      const rayRequest = {
        request_id: request.requestId,
        user_request: request.userRequest,
        state: request.state || {},
        action: request.action,
        params: request.params,
        timestamp: request.timestamp || new Date().toISOString(),
      };

      // 调用 Ray Actor-Worker
      // TODO: 实现实际的 Ray API 调用
      // 可以使用 Ray 的 HTTP API: POST /api/actors/{actor_id}/methods/{method_name}
      const response = await this.callRayActor(
        'ActorWorker',
        'generate_trajectory',
        rayRequest,
      );

      return {
        success: response.success !== false,
        trajectoryId: response.trajectory_id,
        trajectoryRef: response.trajectory_ref,
        trajectory: response.trajectory,
        error: response.error,
      };
    } catch (error: any) {
      const code = this.classifyBridgeError(error);
      this.logger.error(
        `[RollClient] Actor-Worker 调用失败: ${error.message}, code=${code}`,
        error.stack,
      );
      return {
        success: false,
        error: `${code}:${error.message}`,
      };
    }
  }

  /**
   * 调用 Reward-Worker 计算奖励
   */
  async callRewardWorker(
    trajectoryRef: any,
    rewardConfig?: Record<string, any>,
  ): Promise<{
    success: boolean;
    reward?: number;
    rawReward?: number;
    rewardBreakdown?: any[];
    error?: string;
  }> {
    if (!this.enabled) {
      if (!this.isSimulationAllowed()) {
        this.logger.error('[roll_event] event=simulation_blocked service=reward_worker reason="strict_mode_or_no_simulation"');
        return {
          success: false,
          error: 'ROLL disabled and simulation is forbidden by strict mode',
        };
      }
      return this.simulateRewardWorker(trajectoryRef);
    }

    try {
      // 调用 Ray Reward-Worker
      const response = await this.callRayActor(
        'RewardWorker',
        'compute_reward',
        trajectoryRef,
        rewardConfig,
      );

      return {
        success: response.success !== false,
        reward: response.reward,
        rawReward: response.raw_reward,
        rewardBreakdown: response.reward_breakdown,
        error: response.error,
      };
    } catch (error: any) {
      const code = this.classifyBridgeError(error);
      this.logger.error(
        `[RollClient] Reward-Worker 调用失败: ${error.message}, code=${code}`,
        error.stack,
      );
      return {
        success: false,
        error: `${code}:${error.message}`,
      };
    }
  }

  /**
   * 调用 Policy-Worker 进行策略推理
   */
  async callPolicyWorker(state: {
    userRequest: string;
    origin?: string;
    destination?: string;
    constraints?: Record<string, any>;
    preferences?: Record<string, any>;
  }): Promise<{
    success: boolean;
    action?: 'ALLOW' | 'REJECT' | 'ADJUST' | 'CLARIFY';
    confidence?: number;
    reasoning?: string;
    adjustedParams?: Record<string, any>;
    error?: string;
  }> {
    if (!this.enabled) {
      if (!this.isSimulationAllowed()) {
        this.logger.error('[roll_event] event=simulation_blocked service=policy_worker reason="strict_mode_or_no_simulation"');
        return {
          success: false,
          error: 'ROLL disabled and simulation is forbidden by strict mode',
        };
      }
      return this.simulatePolicyWorker(state);
    }

    try {
      // 调用 Ray Policy-Worker
      const response = await this.callRayActor('PolicyWorker', 'predict', state);

      return {
        success: response.success !== false,
        action: response.action,
        confidence: response.confidence,
        reasoning: response.reasoning,
        adjustedParams: response.adjusted_params,
        error: response.error,
      };
    } catch (error: any) {
      const code = this.classifyBridgeError(error);
      this.logger.error(
        `[RollClient] Policy-Worker 调用失败: ${error.message}, code=${code}`,
        error.stack,
      );
      return {
        success: false,
        error: `${code}:${error.message}`,
      };
    }
  }

  /**
   * 启动训练任务
   */
  async startTraining(config: {
    jobId: string;
    modelType: string;
    baseModel: string;
    trainingData: any[];
    hyperparameters?: Record<string, any>;
  }): Promise<{
    success: boolean;
    rayJobId?: string;
    mlflowRunId?: string;
    status?: string;
    error?: string;
  }> {
    if (!this.enabled) {
      if (!this.isSimulationAllowed()) {
        this.logger.error('[roll_event] event=simulation_blocked service=training reason="strict_mode_or_no_simulation"');
        return {
          success: false,
          error: 'ROLL disabled and simulation is forbidden by strict mode',
        };
      }
      return this.simulateTraining(config);
    }

    try {
      // 调用 Bridge Service
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
    } catch (error: any) {
      const code = this.classifyBridgeError(error);
      this.logger.error(
        `[RollClient] 训练任务启动失败: ${error.message}, code=${code}`,
        error.stack,
      );
      return {
        success: false,
        error: `${code}:${error.message}`,
      };
    }
  }

  /**
   * 获取训练任务状态
   */
  async getTrainingStatus(rayJobId: string): Promise<{
    success: boolean;
    status?: string;
    progress?: number;
    metrics?: Record<string, any>;
    error?: string;
  }> {
    if (!this.enabled) {
      return {
        success: false,
        error: 'ROLL 未启用',
      };
    }

    try {
      const response = await this.callBridgeService(
        `/api/training/status/${rayJobId}`,
        'GET',
      );

      return {
        success: response.success !== false,
        status: response.status,
        progress: response.progress,
        metrics: response.metrics,
        error: response.error,
      };
    } catch (error: any) {
      this.logger.error(
        `[RollClient] 查询训练状态失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 取消训练任务
   */
  async cancelTraining(rayJobId: string): Promise<{
    success: boolean;
    status?: string;
    error?: string;
  }> {
    if (!this.enabled) {
      return {
        success: false,
        error: 'ROLL 未启用',
      };
    }

    try {
      const response = await this.callBridgeService(
        `/api/training/cancel/${rayJobId}`,
        'POST',
      );

      return {
        success: response.success !== false,
        status: response.status,
        error: response.error,
      };
    } catch (error: any) {
      this.logger.error(
        `[RollClient] 取消训练任务失败: ${error.message}`,
        error.stack,
      );
      return {
        success: false,
        error: error.message,
      };
    }
  }

  /**
   * 调用 Ray Bridge Service (HTTP API)
   * 带重试、断路器、连接池、缓存和追踪
   */
  private async callBridgeService(
    endpoint: string,
    method: 'GET' | 'POST' = 'POST',
    body?: any,
    useCache: boolean = false,
    parentSpanContext?: SpanContext,
  ): Promise<any> {
    const bridgeUrl = this.connectionPool
      ? this.connectionPool.getBridgeUrl()
      : this.configService.get<string>('ROLL_BRIDGE_URL') || 'http://localhost:8001';
    
    // 开始追踪 Span
    const spanContext = this.tracing
      ? this.tracing.startSpan(`roll.bridge.${endpoint}`, parentSpanContext, {
          'http.method': method,
          'http.url': endpoint,
          'service.name': 'roll-client',
        })
      : undefined;

    const startAt = Date.now();
    try {
      // 检查缓存（仅 GET 请求）
      if (useCache && method === 'GET' && this.cache) {
        const cacheKey = `${endpoint}:${JSON.stringify(body || {})}`;
        const cached = this.cache.get('bridge', cacheKey);
        if (cached !== null) {
          this.logger.debug(`[RollClient] 缓存命中: ${endpoint}`);
          if (spanContext) {
            this.tracing!.endSpan(spanContext.spanId, 'ok', undefined, {
              'cache.hit': true,
            });
          }
          return cached;
        }
      }
      
      const operation = async () => {
        // 准备 HTTP 头
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };

        // 注入追踪上下文
        if (spanContext && this.tracing) {
          this.tracing.injectTraceContext(headers, spanContext);
        }

        // 使用连接池（如果可用）
        const fetchOptions: RequestInit = {
          method,
          headers,
          body: body ? JSON.stringify(body) : undefined,
          signal: AbortSignal.timeout(this.bridgeTimeoutMs),
        };

      // 如果使用 Node.js 的 http/https，可以设置 agent
      // 注意：fetch API 在 Node.js 中可能不支持 agent，需要检查
        const response = await fetch(`${bridgeUrl}${endpoint}`, fetchOptions);

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({
            detail: response.statusText,
          }));
          const httpError: any = new Error(
            (errorData as any).detail || `HTTP ${response.status}`,
          );
          httpError.status = response.status;
          throw httpError;
        }

        const result = await response.json();
        
        // 缓存结果（仅 GET 请求）
        if (useCache && method === 'GET' && this.cache) {
          const cacheKey = `${endpoint}:${JSON.stringify(body || {})}`;
          this.cache.set('bridge', cacheKey, result, 300000); // 5分钟TTL
        }
        
        return result;
      };

      // 使用断路器保护
      const protectedOperation = this.circuitBreaker
        ? () => this.circuitBreaker!.execute(operation, endpoint)
        : operation;

      // 使用重试策略
      let result: any;
      if (this.retryService) {
        result = await this.retryService.executeWithRetry(
          protectedOperation,
          `BridgeService:${endpoint}`,
        );
      } else {
        // 直接执行
        try {
          result = await protectedOperation();
        } catch (error: any) {
          this.logger.error(
            `[RollClient] Bridge Service 调用失败: ${error.message}`,
            error.stack,
          );
          throw error;
        }
      }

      // 结束追踪 Span（成功）
      if (spanContext) {
        this.tracing!.endSpan(spanContext.spanId, 'ok', undefined, {
          'http.status_code': 200,
        });
      }

      const elapsed = Date.now() - startAt;
      this.logger.debug(
        `[roll_event] event=bridge_call_success endpoint=${endpoint} method=${method} latency_ms=${elapsed}`,
      );
      return result;
    } catch (error: any) {
      const elapsed = Date.now() - startAt;
      const code = this.classifyBridgeError(error);
      this.logger.warn(
        `[roll_event] event=bridge_call_failure endpoint=${endpoint} method=${method} code=${code} latency_ms=${elapsed} error="${error?.message ?? 'unknown'}"`,
      );
      // 结束追踪 Span（错误）
      if (spanContext) {
        this.tracing!.endSpan(
          spanContext.spanId,
          'error',
          { message: error.message, code: error.status?.toString() },
          {
            'http.status_code': error.status || 500,
            'error': true,
          },
        );
      }
      throw error;
    }
  }

  /**
   * 调用 Ray Actor (通过 Bridge Service)
   */
  private async callRayActor(
    actorName: string,
    methodName: string,
    ...args: any[]
  ): Promise<any> {
    // 通过 Bridge Service 调用
    // Bridge Service 会处理 Ray Worker 调用
    
    // 根据 actorName 和 methodName 路由到对应的 Bridge API
    let response: any;
    if (actorName === 'ActorWorker' && methodName === 'generate_trajectory') {
      response = await this.callBridgeService('/api/actor/generate-trajectory', 'POST', args[0]);
    } else if (actorName === 'RewardWorker' && methodName === 'compute_reward') {
      response = await this.callBridgeService('/api/reward/compute', 'POST', {
        trajectory: args[0],
        reward_config: args[1],
      });
    } else if (actorName === 'PolicyWorker' && methodName === 'predict') {
      response = await this.callBridgeService('/api/policy/predict', 'POST', args[0]);
    } else {
      throw new Error(`Unknown actor/method: ${actorName}.${methodName}`);
    }
    this.validateActorResponse(actorName, methodName, response);
    return response;
  }

  /**
   * 本地模拟: Actor-Worker
   */
  private simulateActorWorker(request: any): any {
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

  /**
   * 本地模拟: Reward-Worker
   */
  private simulateRewardWorker(_trajectoryRef: any): any {
    this.logger.debug('[RollClient] 使用本地模拟: Reward-Worker');
    return {
      success: true,
      reward: 0.7,
      rawReward: 0.7,
      rewardBreakdown: [],
    };
  }

  /**
   * 本地模拟: Policy-Worker
   */
  private simulatePolicyWorker(_state: any): any {
    this.logger.debug('[RollClient] 使用本地模拟: Policy-Worker');
    return {
      success: true,
      action: 'ALLOW' as const,
      confidence: 0.8,
      reasoning: '模拟策略推理',
    };
  }

  /**
   * 本地模拟: Training
   */
  private simulateTraining(config: any): any {
    this.logger.debug('[RollClient] 使用本地模拟: Training');
    return {
      success: true,
      rayJobId: `local_job_${config.jobId}`,
      mlflowRunId: `mlflow_local_${Date.now()}`,
    };
  }

  /**
   * 健康检查
   */
  async healthCheck(): Promise<{
    status: string;
    rayConnected: boolean;
    workersAvailable: string[];
  }> {
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
      
      const availableWorkers: string[] = [];
      if (workersStatus.actor_workers?.length > 0) {
        availableWorkers.push('ActorWorker');
      }
      if (workersStatus.reward_workers?.length > 0) {
        availableWorkers.push('RewardWorker');
      }
      if (workersStatus.policy_workers?.length > 0) {
        availableWorkers.push('PolicyWorker');
      }
      
      return {
        status: health.status || 'unknown',
        rayConnected: health.ray_connected || false,
        workersAvailable: availableWorkers,
      };
    } catch (error: any) {
      this.logger.warn(`[RollClient] 健康检查失败: ${error.message}`);
      return {
        status: 'unhealthy',
        rayConnected: false,
        workersAvailable: [],
      };
    }
  }

  private getEnvFlag(key: string, fallback: boolean): boolean {
    const value = this.configService.get<string | boolean>(key);
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
      const v = value.trim().toLowerCase();
      if (v === 'true' || v === '1' || v === 'yes') return true;
      if (v === 'false' || v === '0' || v === 'no') return false;
    }
    return fallback;
  }

  private isSimulationAllowed(): boolean {
    // strictMode 优先级最高：开启后永远禁模拟
    if (this.strictMode) return false;
    return this.allowSimulation;
  }

  private classifyBridgeError(error: any): string {
    if (String(error?.code || '').toUpperCase() === 'CONTRACT_VIOLATION') {
      return 'CONTRACT_VIOLATION';
    }
    const status = Number(error?.status);
    if (error?.name === 'TimeoutError' || String(error?.message || '').toLowerCase().includes('timeout')) {
      return 'TIMEOUT';
    }
    if (Number.isFinite(status) && status >= 500) return 'HTTP_5XX';
    if (Number.isFinite(status) && status >= 400) return 'HTTP_4XX';
    if (String(error?.message || '').toLowerCase().includes('worker')) {
      return 'WORKER_UNAVAILABLE';
    }
    return 'UNKNOWN';
  }

  private validateActorResponse(actorName: string, methodName: string, response: any): void {
    const success = response?.success;
    if (typeof success !== 'boolean') {
      this.throwContractViolation(actorName, methodName, 'missing boolean success');
    }
    if (success !== true) return;

    if (actorName === 'ActorWorker' && methodName === 'generate_trajectory') {
      if (!response?.trajectory_id && !response?.trajectory) {
        this.throwContractViolation(actorName, methodName, 'missing trajectory payload');
      }
      return;
    }

    if (actorName === 'RewardWorker' && methodName === 'compute_reward') {
      if (typeof response?.reward !== 'number') {
        this.throwContractViolation(actorName, methodName, 'missing numeric reward');
      }
      return;
    }

    if (actorName === 'PolicyWorker' && methodName === 'predict') {
      if (!response?.action) {
        this.throwContractViolation(actorName, methodName, 'missing action');
      }
    }
  }

  private throwContractViolation(actorName: string, methodName: string, detail: string): never {
    this.logger.error(
      `[roll_event] event=contract_violation actor=${actorName} method=${methodName} detail="${detail}"`,
    );
    const err: any = new Error(
      `Contract violation for ${actorName}.${methodName}: ${detail}`,
    );
    err.code = 'CONTRACT_VIOLATION';
    throw err;
  }
}
