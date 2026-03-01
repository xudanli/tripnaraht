/**
 * 稳定版 SDK 客户端
 *
 * 生产级特性：
 * - 自动重试 (指数退避)
 * - 请求超时控制
 * - 错误分类处理
 * - 请求/响应拦截器
 * - 请求取消支持
 * - 内置日志
 * - 速率限制
 * - 离线队列
 */

// ==================== 类型定义 ====================

export interface SDKClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retryConfig?: RetryConfig;
  logger?: SDKLogger;
  interceptors?: Interceptors;
  rateLimitConfig?: RateLimitConfig;
  offlineConfig?: OfflineConfig;
  headers?: Record<string, string>;
}

export interface RetryConfig {
  maxRetries: number;
  baseDelayMs: number;
  maxDelayMs: number;
  retryableStatuses: number[];
  retryableErrors: string[];
}

export interface RateLimitConfig {
  maxRequestsPerSecond: number;
  maxRequestsPerMinute: number;
  burstSize: number;
}

export interface OfflineConfig {
  enabled: boolean;
  maxQueueSize: number;
  persistQueue: boolean;
}

export interface SDKLogger {
  debug: (message: string, data?: unknown) => void;
  info: (message: string, data?: unknown) => void;
  warn: (message: string, data?: unknown) => void;
  error: (message: string, data?: unknown) => void;
}

export interface Interceptors {
  request?: RequestInterceptor[];
  response?: ResponseInterceptor[];
  error?: ErrorInterceptor[];
}

export type RequestInterceptor = (config: RequestConfig) => RequestConfig | Promise<RequestConfig>;
export type ResponseInterceptor = (response: SDKResponse<unknown>) => SDKResponse<unknown> | Promise<SDKResponse<unknown>>;
export type ErrorInterceptor = (error: SDKError) => SDKError | Promise<SDKError>;

export interface RequestConfig {
  method: string;
  path: string;
  headers: Record<string, string>;
  body?: unknown;
  query?: Record<string, string>;
  timeout?: number;
  signal?: AbortSignal;
  skipRetry?: boolean;
  skipRateLimit?: boolean;
  priority?: 'high' | 'normal' | 'low';
}

export interface SDKResponse<T> {
  data: T;
  status: number;
  headers: Record<string, string>;
  requestId?: string;
  latencyMs: number;
  retryCount: number;
  cached: boolean;
}

export interface SDKError extends Error {
  code: string;
  status?: number;
  requestId?: string;
  retryable: boolean;
  details?: unknown;
}

// ==================== 默认配置 ====================

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 30000,
  retryableStatuses: [408, 429, 500, 502, 503, 504],
  retryableErrors: ['ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED', 'NETWORK_ERROR'],
};

const DEFAULT_RATE_LIMIT: RateLimitConfig = {
  maxRequestsPerSecond: 10,
  maxRequestsPerMinute: 300,
  burstSize: 20,
};

const DEFAULT_OFFLINE_CONFIG: OfflineConfig = {
  enabled: false,
  maxQueueSize: 100,
  persistQueue: false,
};

const DEFAULT_LOGGER: SDKLogger = {
  debug: () => {},
  info: () => {},
  warn: (msg, data) => console.warn(`[SDK] ${msg}`, data),
  error: (msg, data) => console.error(`[SDK] ${msg}`, data),
};

// ==================== 辅助类 ====================

/**
 * 速率限制器 (令牌桶算法)
 */
class RateLimiter {
  private tokens: number;
  private lastRefill: number;
  private readonly config: RateLimitConfig;
  private requestCountPerMinute = 0;
  private minuteStart: number;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.tokens = config.burstSize;
    this.lastRefill = Date.now();
    this.minuteStart = Date.now();
  }

  async acquire(): Promise<void> {
    this.refillTokens();
    this.checkMinuteLimit();

    if (this.tokens < 1) {
      const waitTime = (1 / this.config.maxRequestsPerSecond) * 1000;
      await this.sleep(waitTime);
      this.refillTokens();
    }

    this.tokens -= 1;
    this.requestCountPerMinute += 1;
  }

  private refillTokens(): void {
    const now = Date.now();
    const elapsed = (now - this.lastRefill) / 1000;
    const tokensToAdd = elapsed * this.config.maxRequestsPerSecond;
    this.tokens = Math.min(this.config.burstSize, this.tokens + tokensToAdd);
    this.lastRefill = now;
  }

  private checkMinuteLimit(): void {
    const now = Date.now();
    if (now - this.minuteStart > 60000) {
      this.minuteStart = now;
      this.requestCountPerMinute = 0;
    }

    if (this.requestCountPerMinute >= this.config.maxRequestsPerMinute) {
      throw createSDKError('RATE_LIMIT_EXCEEDED', '已超过每分钟请求限制', 429, false);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * 离线请求队列项
 */
interface QueueItem {
  config: RequestConfig;
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
  timestamp: number;
}

/**
 * 离线请求队列
 */
class OfflineQueue {
  private queue: QueueItem[] = [];
  private readonly maxSize: number;

  constructor(config: OfflineConfig) {
    this.maxSize = config.maxQueueSize;
  }

  enqueue(
    config: RequestConfig,
    resolve: (value: unknown) => void,
    reject: (reason: unknown) => void,
  ): boolean {
    if (this.queue.length >= this.maxSize) {
      return false;
    }

    this.queue.push({ config, resolve, reject, timestamp: Date.now() });
    return true;
  }

  dequeueAll(): QueueItem[] {
    const items = [...this.queue];
    this.queue = [];
    return items;
  }

  size(): number {
    return this.queue.length;
  }

  clear(): void {
    this.queue.forEach(item => {
      item.reject(createSDKError('QUEUE_CLEARED', '离线队列已清空', undefined, false));
    });
    this.queue = [];
  }
}

// ==================== 错误处理 ====================

function createSDKError(
  code: string,
  message: string,
  status?: number,
  retryable = false,
  details?: unknown,
): SDKError {
  const error = new Error(message) as SDKError;
  error.code = code;
  error.status = status;
  error.retryable = retryable;
  error.details = details;
  return error;
}

function isRetryableError(error: unknown, config: RetryConfig): boolean {
  if (error instanceof Error) {
    const sdkError = error as SDKError;

    if (sdkError.status && config.retryableStatuses.includes(sdkError.status)) {
      return true;
    }

    if (sdkError.code && config.retryableErrors.includes(sdkError.code)) {
      return true;
    }
  }

  return false;
}

// ==================== 主客户端类 ====================

export class StableSDKClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly retryConfig: RetryConfig;
  private readonly logger: SDKLogger;
  private readonly interceptors: Interceptors;
  private readonly rateLimiter: RateLimiter;
  private readonly offlineQueue: OfflineQueue;
  private readonly offlineConfig: OfflineConfig;

  private isOnline = true;
  private pendingRequests = new Map<string, AbortController>();

  constructor(config: SDKClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.retryConfig = { ...DEFAULT_RETRY_CONFIG, ...config.retryConfig };
    this.logger = config.logger ?? DEFAULT_LOGGER;
    this.interceptors = config.interceptors ?? {};
    this.rateLimiter = new RateLimiter(config.rateLimitConfig ?? DEFAULT_RATE_LIMIT);
    this.offlineConfig = config.offlineConfig ?? DEFAULT_OFFLINE_CONFIG;
    this.offlineQueue = new OfflineQueue(this.offlineConfig);

    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.handleOnline());
      window.addEventListener('offline', () => this.handleOffline());
    }
  }

  // ==================== 公共 API ====================

  /**
   * 发送请求 (带完整稳定性保障)
   */
  async request<T>(config: RequestConfig): Promise<SDKResponse<T>> {
    const requestId = this.generateRequestId();
    const startTime = Date.now();

    this.logger.debug(`[${requestId}] 开始请求`, { method: config.method, path: config.path });

    try {
      // 1. 检查离线状态
      if (!this.isOnline && this.offlineConfig.enabled) {
        return this.handleOfflineRequest<T>(config);
      }

      // 2. 速率限制
      if (!config.skipRateLimit) {
        await this.rateLimiter.acquire();
      }

      // 3. 应用请求拦截器
      let finalConfig = config;
      for (const interceptor of this.interceptors.request ?? []) {
        finalConfig = await interceptor(finalConfig);
      }

      // 4. 执行请求 (带重试)
      let response = await this.executeWithRetry<T>(finalConfig, requestId);

      // 5. 应用响应拦截器
      for (const interceptor of this.interceptors.response ?? []) {
        response = await interceptor(response) as SDKResponse<T>;
      }

      const latencyMs = Date.now() - startTime;
      response.latencyMs = latencyMs;
      response.requestId = requestId;

      this.logger.info(`[${requestId}] 请求完成`, {
        status: response.status,
        latencyMs,
        retryCount: response.retryCount,
      });

      return response;

    } catch (error) {
      const sdkError = this.normalizeError(error, requestId);

      // 应用错误拦截器
      let finalError = sdkError;
      for (const interceptor of this.interceptors.error ?? []) {
        finalError = await interceptor(finalError);
      }

      this.logger.error(`[${requestId}] 请求失败`, {
        code: finalError.code,
        message: finalError.message,
        status: finalError.status,
      });

      throw finalError;
    }
  }

  /**
   * GET 请求
   */
  async get<T>(path: string, query?: Record<string, string>, options?: Partial<RequestConfig>): Promise<SDKResponse<T>> {
    return this.request<T>({
      method: 'GET',
      path,
      query,
      headers: {},
      ...options,
    });
  }

  /**
   * POST 请求
   */
  async post<T>(path: string, body?: unknown, options?: Partial<RequestConfig>): Promise<SDKResponse<T>> {
    return this.request<T>({
      method: 'POST',
      path,
      body,
      headers: {},
      ...options,
    });
  }

  /**
   * PUT 请求
   */
  async put<T>(path: string, body?: unknown, options?: Partial<RequestConfig>): Promise<SDKResponse<T>> {
    return this.request<T>({
      method: 'PUT',
      path,
      body,
      headers: {},
      ...options,
    });
  }

  /**
   * DELETE 请求
   */
  async delete<T>(path: string, options?: Partial<RequestConfig>): Promise<SDKResponse<T>> {
    return this.request<T>({
      method: 'DELETE',
      path,
      headers: {},
      ...options,
    });
  }

  /**
   * 取消指定请求
   */
  cancelRequest(requestId: string): boolean {
    const controller = this.pendingRequests.get(requestId);
    if (controller) {
      controller.abort();
      this.pendingRequests.delete(requestId);
      this.logger.info(`[${requestId}] 请求已取消`);
      return true;
    }
    return false;
  }

  /**
   * 取消所有请求
   */
  cancelAllRequests(): number {
    let count = 0;
    for (const [requestId, controller] of this.pendingRequests) {
      controller.abort();
      this.logger.info(`[${requestId}] 请求已取消`);
      count++;
    }
    this.pendingRequests.clear();
    return count;
  }

  /**
   * 获取离线队列大小
   */
  getOfflineQueueSize(): number {
    return this.offlineQueue.size();
  }

  /**
   * 清空离线队列
   */
  clearOfflineQueue(): void {
    this.offlineQueue.clear();
  }

  /**
   * 设置在线状态
   */
  setOnlineStatus(online: boolean): void {
    const wasOffline = !this.isOnline;
    this.isOnline = online;

    if (wasOffline && online) {
      this.handleOnline();
    } else if (!online) {
      this.handleOffline();
    }
  }

  // ==================== 私有方法 ====================

  private async executeWithRetry<T>(config: RequestConfig, requestId: string): Promise<SDKResponse<T>> {
    let lastError: SDKError | null = null;
    let retryCount = 0;

    for (let attempt = 0; attempt <= this.retryConfig.maxRetries; attempt++) {
      try {
        const response = await this.executeRequest<T>(config, requestId);
        return { ...response, retryCount };

      } catch (error) {
        lastError = this.normalizeError(error, requestId);

        if (config.skipRetry || !isRetryableError(lastError, this.retryConfig) || attempt >= this.retryConfig.maxRetries) {
          throw lastError;
        }

        retryCount = attempt + 1;
        const delay = this.calculateRetryDelay(attempt);

        this.logger.warn(`[${requestId}] 重试 ${retryCount}/${this.retryConfig.maxRetries}，等待 ${delay}ms`, {
          error: lastError.message,
        });

        await this.sleep(delay);
      }
    }

    throw lastError ?? createSDKError('UNKNOWN_ERROR', '未知错误', undefined, false);
  }

  private async executeRequest<T>(config: RequestConfig, requestId: string): Promise<SDKResponse<T>> {
    const url = new URL(config.path, this.baseUrl);

    if (config.query) {
      Object.entries(config.query).forEach(([key, value]) => {
        if (value !== undefined && value !== null) {
          url.searchParams.append(key, String(value));
        }
      });
    }

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
      ...config.headers,
    };

    if (this.apiKey) {
      headers['Authorization'] = `Bearer ${this.apiKey}`;
    }

    const controller = new AbortController();
    this.pendingRequests.set(requestId, controller);

    const timeoutId = setTimeout(() => controller.abort(), config.timeout ?? this.timeout);

    try {
      const response = await fetch(url.toString(), {
        method: config.method,
        headers,
        body: config.body ? JSON.stringify(config.body) : undefined,
        signal: config.signal ?? controller.signal,
      });

      clearTimeout(timeoutId);
      this.pendingRequests.delete(requestId);

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw createSDKError(
          errorBody.error?.code ?? `HTTP_${response.status}`,
          errorBody.error?.message ?? response.statusText,
          response.status,
          this.retryConfig.retryableStatuses.includes(response.status),
          errorBody,
        );
      }

      const data = await response.json();
      const responseHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        responseHeaders[key] = value;
      });

      return {
        data,
        status: response.status,
        headers: responseHeaders,
        latencyMs: 0,
        retryCount: 0,
        cached: false,
      };

    } catch (error) {
      clearTimeout(timeoutId);
      this.pendingRequests.delete(requestId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw createSDKError('REQUEST_TIMEOUT', '请求超时', 408, true);
      }

      throw error;
    }
  }

  private async handleOfflineRequest<T>(config: RequestConfig): Promise<SDKResponse<T>> {
    return new Promise((resolve, reject) => {
      const enqueued = this.offlineQueue.enqueue(
        config,
        resolve as (value: unknown) => void,
        reject,
      );

      if (!enqueued) {
        reject(createSDKError('OFFLINE_QUEUE_FULL', '离线队列已满', undefined, false));
      } else {
        this.logger.info('请求已加入离线队列', { path: config.path });
      }
    });
  }

  private handleOnline(): void {
    this.isOnline = true;
    this.logger.info('网络已恢复，处理离线队列');

    const pending = this.offlineQueue.dequeueAll();
    for (const item of pending) {
      this.request(item.config)
        .then(item.resolve)
        .catch(item.reject);
    }
  }

  private handleOffline(): void {
    this.isOnline = false;
    this.logger.warn('网络已断开，启用离线模式');
  }

  private calculateRetryDelay(attempt: number): number {
    const exponentialDelay = this.retryConfig.baseDelayMs * Math.pow(2, attempt);
    const jitter = Math.random() * 0.3 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.retryConfig.maxDelayMs);
  }

  private normalizeError(error: unknown, requestId: string): SDKError {
    if (error && typeof error === 'object' && 'code' in error) {
      const sdkError = error as SDKError;
      sdkError.requestId = requestId;
      return sdkError;
    }

    if (error instanceof Error) {
      if (error.message.includes('fetch') || error.message.includes('network')) {
        return createSDKError('NETWORK_ERROR', '网络连接失败', undefined, true, error);
      }
      return createSDKError('UNKNOWN_ERROR', error.message, undefined, false, error);
    }

    return createSDKError('UNKNOWN_ERROR', String(error), undefined, false);
  }

  private generateRequestId(): string {
    return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ==================== Decision OS 专用客户端 ====================

export interface DecisionRequest {
  tripId: string;
  userId?: string;
  preferences?: Record<string, number>;
  constraints?: Record<string, unknown>;
  options?: {
    includeExplanation?: boolean;
    maxAlternatives?: number;
    language?: 'zh' | 'en';
  };
}

export interface DecisionResponse {
  decisionId: string;
  status: 'pending' | 'completed' | 'failed';
  selectedPlan?: {
    id: string;
    items: unknown[];
    utility: number;
  };
  alternatives?: Array<{
    id: string;
    utility: number;
    summary: string;
  }>;
  explanation?: {
    summary: string;
    keyFactors: Array<{
      name: string;
      contribution: string;
      description: string;
    }>;
  };
  confidence: number;
  processingTime: number;
}

export interface FeedbackRequest {
  type: 'rating' | 'preference' | 'correction';
  rating?: number;
  comment?: string;
  selectedOption?: string;
}

export interface FeedbackResponse {
  feedbackId: string;
  received: boolean;
  message: string;
}

/**
 * Decision OS 专用客户端
 *
 * 基于 StableSDKClient 构建，提供业务级 API
 */
export class DecisionOSClient {
  private readonly client: StableSDKClient;

  constructor(config: SDKClientConfig) {
    this.client = new StableSDKClient(config);
  }

  // ==================== 决策 API ====================

  /**
   * 创建决策请求
   */
  async createDecision(request: DecisionRequest): Promise<SDKResponse<DecisionResponse>> {
    return this.client.post<DecisionResponse>('/api/v1/decisions', request);
  }

  /**
   * 获取决策详情
   */
  async getDecision(decisionId: string): Promise<SDKResponse<DecisionResponse>> {
    return this.client.get<DecisionResponse>(`/api/v1/decisions/${decisionId}`);
  }

  /**
   * 获取决策解释
   */
  async getExplanation(
    decisionId: string,
    options?: { language?: 'zh' | 'en'; detailLevel?: 'brief' | 'standard' | 'detailed' },
  ): Promise<SDKResponse<{ summary: string; keyFactors: unknown[] }>> {
    return this.client.get(`/api/v1/decisions/${decisionId}/explanation`, options as Record<string, string>);
  }

  /**
   * 切换选择方案
   */
  async selectAlternative(decisionId: string, planId: string, reason?: string): Promise<SDKResponse<{ success: boolean }>> {
    return this.client.post(`/api/v1/decisions/${decisionId}/select`, { planId, reason });
  }

  // ==================== 反馈 API ====================

  /**
   * 提交反馈
   */
  async submitFeedback(decisionId: string, feedback: FeedbackRequest): Promise<SDKResponse<FeedbackResponse>> {
    return this.client.post<FeedbackResponse>(`/api/v1/decisions/${decisionId}/feedback`, feedback);
  }

  // ==================== 用户 API ====================

  /**
   * 获取决策历史
   */
  async getDecisionHistory(options?: {
    page?: number;
    pageSize?: number;
    tripId?: string;
  }): Promise<SDKResponse<{ items: DecisionResponse[]; pagination: unknown }>> {
    return this.client.get('/api/v1/users/me/decisions', options as Record<string, string>);
  }

  /**
   * 获取学习进度
   */
  async getLearningProgress(): Promise<SDKResponse<{
    totalInteractions: number;
    preferenceLearned: Record<string, { confidence: number; trend: string }>;
    recommendationAccuracy: number;
  }>> {
    return this.client.get('/api/v1/users/me/learning-progress');
  }

  // ==================== 工具方法 ====================

  /**
   * 取消请求
   */
  cancelRequest(requestId: string): boolean {
    return this.client.cancelRequest(requestId);
  }

  /**
   * 取消所有请求
   */
  cancelAllRequests(): number {
    return this.client.cancelAllRequests();
  }

  /**
   * 设置在线状态
   */
  setOnlineStatus(online: boolean): void {
    this.client.setOnlineStatus(online);
  }

  /**
   * 获取离线队列大小
   */
  getOfflineQueueSize(): number {
    return this.client.getOfflineQueueSize();
  }

  // ==================== CLI 兼容方法 ====================

  /**
   * 健康检查
   */
  async getHealth(): Promise<SDKResponse<{
    status: 'healthy' | 'degraded' | 'unhealthy';
    components: Array<{ name: string; status: string; latencyMs: number }>;
    uptime: number;
  }>> {
    return this.client.get('/api/v1/health');
  }

  /**
   * 存活检查
   */
  async isAlive(): Promise<boolean> {
    try {
      const response = await this.client.get<{ status: string }>('/api/v1/health/live');
      return response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * 就绪检查
   */
  async isReady(): Promise<boolean> {
    try {
      const response = await this.client.get<{ status: string }>('/api/v1/health/ready');
      return response.data?.status === 'ok';
    } catch {
      return false;
    }
  }

  /**
   * 获取 Prometheus 指标
   */
  async getPrometheusMetrics(): Promise<SDKResponse<string>> {
    return this.client.get('/api/v1/metrics/prometheus');
  }

  /**
   * 获取指标摘要
   */
  async getMetricsSummary(): Promise<SDKResponse<{
    decisions: { total: number; avgLatencyMs: number; successRate: number };
    learning: { totalFeedback: number; learningRate: number };
    system: { uptime: number; memoryUsage: number; cpuUsage: number };
  }>> {
    return this.client.get('/api/v1/metrics/summary');
  }

  /**
   * 获取 DSO 快照列表
   */
  async getSnapshots(options?: {
    requestId?: string;
    limit?: number;
  }): Promise<SDKResponse<Array<{
    snapshotId: string;
    requestId: string;
    version: number;
    createdAt: string;
    size: number;
  }>>> {
    return this.client.get('/api/v1/snapshots', options as Record<string, string>);
  }

  /**
   * 获取稳定性分析
   */
  async getStabilityAnalysis(): Promise<SDKResponse<{
    lyapunovValue: number;
    isStable: boolean;
    convergenceRate: number;
    recentTrend: Array<{ timestamp: string; value: number }>;
  }>> {
    return this.client.get('/api/v1/analysis/stability');
  }

  /**
   * 计算两个快照之间的差异
   */
  async computeDiff(snapshotId1: string, snapshotId2: string): Promise<SDKResponse<{
    changes: Array<{
      path: string;
      operation: 'add' | 'remove' | 'replace';
      oldValue?: unknown;
      newValue?: unknown;
    }>;
    summary: { added: number; removed: number; modified: number };
  }>> {
    return this.client.get(`/api/v1/snapshots/diff`, { from: snapshotId1, to: snapshotId2 });
  }

  /**
   * 回滚到指定快照
   */
  async rollback(snapshotId: string, reason?: string): Promise<SDKResponse<{
    success: boolean;
    newVersion: number;
    restoredAt: string;
  }>> {
    return this.client.post('/api/v1/snapshots/rollback', { snapshotId, reason });
  }

  /**
   * 执行决策（CLI 兼容）
   */
  async makeDecision(params: {
    tripId: string;
    userId?: string;
    dso?: Record<string, unknown>;
  }): Promise<SDKResponse<DecisionResponse>> {
    return this.createDecision({
      tripId: params.tripId,
      userId: params.userId,
      preferences: params.dso?.preferences as Record<string, number>,
      constraints: params.dso?.constraints as Record<string, unknown>,
    });
  }
}

// ==================== 工厂函数 ====================

/**
 * 创建 Decision OS 客户端（CLI 兼容）
 */
export function createDecisionOSClient(config: SDKClientConfig): DecisionOSClient {
  return new DecisionOSClient(config);
}

// ==================== 导出 ====================

export default DecisionOSClient;
