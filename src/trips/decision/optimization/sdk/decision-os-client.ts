/**
 * Decision OS API 客户端 SDK
 * 
 * 提供类型安全的 API 调用接口，支持：
 * - 自动重试
 * - 请求超时
 * - 错误处理
 * - TypeScript 类型推断
 * 
 * @example
 * ```typescript
 * const client = new DecisionOSClient({
 *   baseUrl: 'http://localhost:3000',
 *   apiKey: 'your-api-key',
 * });
 * 
 * const decision = await client.makeDecision({
 *   requestId: 'req-001',
 *   userId: 'user-001',
 *   dso: decisionState,
 * });
 * ```
 */

// ========== 类型定义 ==========

export interface DecisionOSClientConfig {
  baseUrl: string;
  apiKey?: string;
  timeout?: number;
  retries?: number;
  retryDelay?: number;
  headers?: Record<string, string>;
}

export interface DecisionRequest {
  requestId: string;
  userId: string;
  dso: Record<string, unknown>;
  options?: {
    useMonteCarlo?: boolean;
    useExploration?: boolean;
    lockTimeout?: number;
  };
}

export interface DecisionResponse {
  requestId: string;
  recommendedAction: string;
  actionProbabilities: Record<string, number>;
  expectedUtility: number;
  confidence: number;
  policyEntropy: number;
  dsoVersion: number;
  latencyMs: number;
}

export interface FeedbackRequest {
  decisionId: string;
  userId: string;
  satisfactionScore?: number;
  actualUtility?: number;
  /** 决策时给出的期望效用，与 actualUtility 一起用于 prediction regret */
  predictedUtility?: number;
  explicitFeedback?: {
    type: 'LIKE' | 'DISLIKE' | 'NEUTRAL';
    comment?: string;
  };
  behavioralSignals?: {
    completed: boolean;
    modificationCount: number;
    dwellTimeSeconds?: number;
  };
}

export interface FeedbackResponse {
  processed: boolean;
  learningTriggered: boolean;
  weightsUpdated: boolean;
  newConvergenceStatus?: string;
  /** [0,1] 单侧预测 regret，仅当请求同时含 predictedUtility 与 actualUtility 时有值 */
  predictionRegret01?: number;
}

export interface HealthStatus {
  status: 'up' | 'down' | 'degraded';
  details: {
    uptime: number;
    totalDecisions: number;
    totalFeedback: number;
    convergenceStatus: string;
    components: Record<string, boolean>;
    latency: { p50: number; p95: number; p99: number };
  };
}

export interface SnapshotSummary {
  requestId: string;
  version: number;
  phase: string;
  confidence?: number;
  lyapunovValue?: number;
  createdAt: string;
}

export interface StabilityAnalysis {
  requestId: string;
  isStable: boolean;
  values: Array<{
    version: number;
    phase: string;
    lyapunovValue: number;
    timestamp: string;
  }>;
  convergenceRate?: number;
  isDecreasing: boolean;
}

export interface DiffResult {
  fromVersion: number;
  toVersion: number;
  changes: Array<{
    path: string;
    type: 'added' | 'removed' | 'changed';
    oldValue?: unknown;
    newValue?: unknown;
  }>;
}

export interface MetricsSummary {
  decisions: { total: number; byPhase: Record<string, number> };
  latency: { p50: number; p95: number; p99: number };
  utility: { mean: number; min: number; max: number };
  learning: { updates: number; convergenceStatus: string };
}

export class DecisionOSError extends Error {
  constructor(
    message: string,
    public statusCode: number,
    public code: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'DecisionOSError';
  }
}

// ========== API 客户端 ==========

export class DecisionOSClient {
  private readonly baseUrl: string;
  private readonly apiKey?: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly retryDelay: number;
  private readonly headers: Record<string, string>;

  constructor(config: DecisionOSClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, '');
    this.apiKey = config.apiKey;
    this.timeout = config.timeout ?? 30000;
    this.retries = config.retries ?? 3;
    this.retryDelay = config.retryDelay ?? 1000;
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };

    if (this.apiKey) {
      this.headers['Authorization'] = `Bearer ${this.apiKey}`;
    }
  }

  // ========== 决策 API ==========

  async makeDecision(request: DecisionRequest): Promise<DecisionResponse> {
    return this.post<DecisionResponse>('/api/v2/user/optimization/decide', request);
  }

  async submitFeedback(request: FeedbackRequest): Promise<FeedbackResponse> {
    return this.post<FeedbackResponse>('/api/v2/user/optimization/feedback', request);
  }

  // ========== 健康检查 API ==========

  async getHealth(): Promise<{ decisionOS: HealthStatus }> {
    return this.get('/health');
  }

  async isAlive(): Promise<boolean> {
    try {
      await this.get('/health/live');
      return true;
    } catch {
      return false;
    }
  }

  async isReady(): Promise<boolean> {
    try {
      await this.get('/health/ready');
      return true;
    } catch {
      return false;
    }
  }

  // ========== 审计 API ==========

  async getSnapshots(params?: {
    requestId?: string;
    phase?: string;
    startTime?: string;
    endTime?: string;
    limit?: number;
    offset?: number;
  }): Promise<SnapshotSummary[]> {
    const query = new URLSearchParams();
    if (params) {
      Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined) query.append(key, String(value));
      });
    }
    const queryStr = query.toString();
    return this.get(`/api/v2/admin/dso-audit/snapshots${queryStr ? `?${queryStr}` : ''}`);
  }

  async getLatestSnapshot(requestId: string): Promise<SnapshotSummary | null> {
    return this.get(`/api/v2/admin/dso-audit/snapshots/${requestId}/latest`);
  }

  async getSnapshotByVersion(requestId: string, version: number): Promise<SnapshotSummary | null> {
    return this.get(`/api/v2/admin/dso-audit/snapshots/${requestId}/${version}`);
  }

  async getStabilityAnalysis(requestId: string): Promise<StabilityAnalysis> {
    return this.get(`/api/v2/admin/dso-audit/stability/${requestId}`);
  }

  async computeDiff(requestId: string, fromVersion: number, toVersion: number): Promise<DiffResult> {
    return this.post('/api/v2/admin/dso-audit/diff', {
      requestId,
      fromVersion,
      toVersion,
    });
  }

  async rollback(requestId: string, targetVersion: number): Promise<{ success: boolean; restoredDso: unknown }> {
    return this.post('/api/v2/admin/dso-audit/rollback', {
      requestId,
      targetVersion,
    });
  }

  // ========== 指标 API ==========

  async getPrometheusMetrics(): Promise<string> {
    const response = await this.request<string>('/api/v2/admin/metrics/prometheus', {
      method: 'GET',
      headers: { ...this.headers, Accept: 'text/plain' },
    });
    return response;
  }

  async getMetricsSummary(): Promise<MetricsSummary> {
    return this.get('/api/v2/admin/metrics/summary');
  }

  async getDecisionStats(): Promise<{
    totalDecisions: number;
    totalFeedback: number;
    avgLatency: number;
    avgUtility: number;
  }> {
    return this.get('/api/v2/admin/metrics/decision-stats');
  }

  // ========== 私有方法 ==========

  private async get<T>(path: string): Promise<T> {
    return this.request<T>(path, { method: 'GET' });
  }

  private async post<T>(path: string, body: unknown): Promise<T> {
    return this.request<T>(path, {
      method: 'POST',
      body: JSON.stringify(body),
    });
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), this.timeout);

        const response = await fetch(url, {
          ...init,
          headers: { ...this.headers, ...init.headers },
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          const errorBody = await response.text();
          let errorData: { message?: string; code?: string; details?: unknown } = {};
          try {
            errorData = JSON.parse(errorBody);
          } catch {
            errorData = { message: errorBody };
          }

          throw new DecisionOSError(
            errorData.message ?? `HTTP ${response.status}`,
            response.status,
            errorData.code ?? 'HTTP_ERROR',
            errorData.details,
          );
        }

        const contentType = response.headers.get('content-type');
        if (contentType?.includes('application/json')) {
          return (await response.json()) as T;
        }
        return (await response.text()) as unknown as T;

      } catch (error) {
        lastError = error as Error;

        if (error instanceof DecisionOSError) {
          if (error.statusCode >= 400 && error.statusCode < 500) {
            throw error;
          }
        }

        if ((error as Error).name === 'AbortError') {
          lastError = new DecisionOSError('Request timeout', 408, 'TIMEOUT');
        }

        if (attempt < this.retries) {
          await this.sleep(this.retryDelay * Math.pow(2, attempt));
        }
      }
    }

    throw lastError ?? new DecisionOSError('Unknown error', 500, 'UNKNOWN');
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// ========== 工厂函数 ==========

export function createDecisionOSClient(config: DecisionOSClientConfig): DecisionOSClient {
  return new DecisionOSClient(config);
}

// ========== React Hook (可选) ==========

export interface UseDecisionOSOptions {
  client: DecisionOSClient;
}

export interface UseDecisionResult {
  decision: DecisionResponse | null;
  loading: boolean;
  error: DecisionOSError | null;
  makeDecision: (request: DecisionRequest) => Promise<void>;
  submitFeedback: (request: FeedbackRequest) => Promise<FeedbackResponse>;
  reset: () => void;
}

/**
 * 用于 React 的决策 Hook（需要 React 环境）
 * 
 * @example
 * ```tsx
 * const { decision, loading, error, makeDecision } = useDecisionOS({ client });
 * 
 * const handleDecision = async () => {
 *   await makeDecision({ requestId: 'req-1', userId: 'user-1', dso: state });
 * };
 * ```
 */
export function createUseDecisionOS(React: {
  useState: <T>(initial: T) => [T, (value: T) => void];
  useCallback: <T extends (...args: any[]) => any>(fn: T, deps: unknown[]) => T;
}) {
  return function useDecisionOS(options: UseDecisionOSOptions): UseDecisionResult {
    const { client } = options;
    const [decision, setDecision] = React.useState<DecisionResponse | null>(null);
    const [loading, setLoading] = React.useState(false);
    const [error, setError] = React.useState<DecisionOSError | null>(null);

    const makeDecision = React.useCallback(async (request: DecisionRequest) => {
      setLoading(true);
      setError(null);
      try {
        const result = await client.makeDecision(request);
        setDecision(result);
      } catch (e) {
        setError(e as DecisionOSError);
      } finally {
        setLoading(false);
      }
    }, [client]);

    const submitFeedback = React.useCallback(async (request: FeedbackRequest) => {
      return client.submitFeedback(request);
    }, [client]);

    const reset = React.useCallback(() => {
      setDecision(null);
      setError(null);
    }, []);

    return { decision, loading, error, makeDecision, submitFeedback, reset };
  };
}
