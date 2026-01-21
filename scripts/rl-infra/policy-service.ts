/**
 * RL Policy Service - TypeScript/Express 实现
 *
 * 职责：在线策略推理服务
 *
 * 功能：
 * 1. POST /predict - 策略推理
 * 2. POST /batch-predict - 批量推理
 * 3. GET /health - 健康检查
 * 4. GET /metrics - 获取指标
 * 5. POST /deploy - 部署新模型
 * 6. POST /rollback - 回滚模型
 */

import express, { Request, Response, NextFunction } from 'express';
import {
  PolicyAction,
  RLState,
  PredictRequest,
  PredictResponse,
  BatchPredictRequest,
  BatchPredictResponse,
  DeployRequest,
  DeployResponse,
  ServiceMetrics,
  HealthResponse,
} from './policy-service-types';

// ===================== 服务状态 =====================

class PolicyServiceState {
  current_model_version: string = 'v1.0.0';
  fallback_model_version: string = 'v0.9.0';
  total_requests: number = 0;
  success_count: number = 0;
  error_count: number = 0;
  latencies: number[] = [];
  start_time: number = Date.now();
  model_loaded: boolean = true;
}

const state = new PolicyServiceState();

// ===================== 工具函数 =====================

/**
 * 计算百分位数
 */
function percentile(data: number[], p: number): number {
  if (!data || data.length === 0) {
    return 0;
  }
  const sorted = [...data].sort((a, b) => a - b);
  const k = ((sorted.length - 1) * p) / 100;
  const f = Math.floor(k);
  const c = f + 1;
  if (c >= sorted.length) {
    return sorted[sorted.length - 1];
  }
  return sorted[f] * (c - k) + sorted[c] * (k - f);
}

/**
 * 计算 QPS (每秒查询数)
 */
function calculateQPS(): number {
  const elapsed_time = (Date.now() - state.start_time) / 1000; // 秒
  return elapsed_time > 0 ? state.total_requests / elapsed_time : 0;
}

/**
 * 计算错误率
 */
function calculateErrorRate(): number {
  return state.total_requests > 0
    ? state.error_count / state.total_requests
    : 0;
}

// ===================== 推理逻辑 =====================

/**
 * 执行策略推理
 */
async function runPolicyInference(
  request: PredictRequest,
): Promise<PredictResponse> {
  const start_time = Date.now();

  try {
    // 模拟异步处理
    await new Promise((resolve) => setTimeout(resolve, 10));

    let action: PolicyAction = PolicyAction.ALLOW;
    let confidence: number = 0.95;
    let reasoning: string = 'Plan appears safe and feasible';

    // 检查高风险目的地
    if (
      request.state.destination &&
      String(request.state.destination)
        .toUpperCase()
        .includes('HIGH_RISK')
    ) {
      action = PolicyAction.REJECT;
      confidence = 0.99;
      reasoning = 'Destination flagged as high risk';
    }
    // 检查预算约束
    else if (request.state.constraints) {
      const budget = request.state.constraints.budget;
      if (budget !== undefined && budget < 100) {
        action = PolicyAction.CLARIFY;
        confidence = 0.8;
        reasoning = 'Budget may be insufficient';
      }
    }

    const latency_ms = Date.now() - start_time;
    const model_version =
      request.model_version || state.current_model_version;

    // 更新统计
    state.total_requests++;
    state.success_count++;
    state.latencies.push(latency_ms);

    // 保持最近 1000 条延迟记录
    if (state.latencies.length > 1000) {
      state.latencies.shift();
    }

    return {
      request_id: request.request_id,
      action,
      confidence,
      reasoning,
      model_version,
      latency_ms,
      timestamp: new Date().toISOString(),
    };
  } catch (error: any) {
    state.total_requests++;
    state.error_count++;
    console.error(`[Policy] Error: ${error?.message}`, error?.stack);
    throw error;
  }
}

// ===================== Express 应用 =====================

const app = express();
app.use(express.json());

// 请求日志中间件
app.use((req: Request, res: Response, next: NextFunction) => {
  console.log(`[PolicyService] ${req.method} ${req.path}`);
  next();
});

// 错误处理中间件
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error(`[PolicyService] Error: ${err.message}`, err.stack);
  res.status(500).json({
    error: 'Internal server error',
    message: err.message,
  });
});

// ===================== API 端点 =====================

/**
 * GET /health - 健康检查
 */
app.get('/health', (req: Request, res: Response) => {
  const latencies = state.latencies.length > 0 ? state.latencies : [0];
  const sorted_latencies = [...latencies].sort((a, b) => a - b);
  const p95_latency_ms = percentile(sorted_latencies, 95);

  const health: HealthResponse = {
    status: state.model_loaded ? 'healthy' : 'unhealthy',
    service: 'policy',
    model_loaded: state.model_loaded,
    current_model_version: state.current_model_version,
    fallback_model_version: state.fallback_model_version,
    qps: calculateQPS(),
    p95_latency_ms,
    error_rate: calculateErrorRate(),
    uptime_seconds: Math.floor((Date.now() - state.start_time) / 1000),
  };

  res.json(health);
});

/**
 * POST /predict - 策略推理
 */
app.post('/predict', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const request: PredictRequest = req.body;

    // 验证请求
    if (!request.request_id || !request.state) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'request_id and state are required',
      });
    }

    const response = await runPolicyInference(request);
    res.json(response);
  } catch (error: any) {
    next(error);
  }
});

/**
 * POST /batch-predict - 批量推理
 */
app.post(
  '/batch-predict',
  async (req: Request, res: Response, next: NextFunction) => {
    try {
      const batchRequest: BatchPredictRequest = req.body;

      if (!batchRequest.requests || !Array.isArray(batchRequest.requests)) {
        return res.status(400).json({
          error: 'Invalid request',
          message: 'requests array is required',
        });
      }

      const start_time = Date.now();
      const responses: PredictResponse[] = [];

      // 顺序处理每个请求（可以改为并行以提高性能）
      for (const request of batchRequest.requests) {
        const response = await runPolicyInference(request);
        responses.push(response);
      }

      const total_latency_ms = Date.now() - start_time;

      const batchResponse: BatchPredictResponse = {
        responses,
        total_latency_ms,
      };

      res.json(batchResponse);
    } catch (error: any) {
      next(error);
    }
  },
);

/**
 * GET /metrics - 获取服务指标
 */
app.get('/metrics', (req: Request, res: Response) => {
  const latencies = state.latencies.length > 0 ? state.latencies : [0];
  const sorted_latencies = [...latencies].sort((a, b) => a - b);

  const metrics: ServiceMetrics = {
    total_requests: state.total_requests,
    success_count: state.success_count,
    error_count: state.error_count,
    avg_latency_ms:
      latencies.reduce((sum, val) => sum + val, 0) / latencies.length,
    p50_latency_ms: percentile(sorted_latencies, 50),
    p95_latency_ms: percentile(sorted_latencies, 95),
    p99_latency_ms: percentile(sorted_latencies, 99),
    qps: calculateQPS(),
    model_version: state.current_model_version,
  };

  res.json(metrics);
});

/**
 * POST /deploy - 部署模型
 */
app.post('/deploy', (req: Request, res: Response) => {
  try {
    const deployRequest: DeployRequest = req.body;

    if (!deployRequest.model_version) {
      return res.status(400).json({
        error: 'Invalid request',
        message: 'model_version is required',
      });
    }

    const old_version = state.current_model_version;
    state.current_model_version = deployRequest.model_version;
    state.model_loaded = true;

    console.log(
      `[PolicyService] Deploy: ${old_version} -> ${deployRequest.model_version}`,
    );

    const deployResponse: DeployResponse = {
      status: 'deployed',
      old_version,
      new_version: deployRequest.model_version,
      deployed_at: new Date().toISOString(),
    };

    res.json(deployResponse);
  } catch (error: any) {
    res.status(500).json({
      error: 'Deployment failed',
      message: error?.message,
    });
  }
});

/**
 * POST /rollback - 回滚模型
 */
app.post('/rollback', (req: Request, res: Response) => {
  try {
    const old_version = state.current_model_version;
    state.current_model_version = state.fallback_model_version;
    state.model_loaded = true;

    console.log(
      `[PolicyService] Rollback: ${old_version} -> ${state.fallback_model_version}`,
    );

    const rollbackResponse: DeployResponse = {
      status: 'rolled_back',
      old_version,
      new_version: state.fallback_model_version,
      deployed_at: new Date().toISOString(),
    };

    res.json(rollbackResponse);
  } catch (error: any) {
    res.status(500).json({
      error: 'Rollback failed',
      message: error?.message,
    });
  }
});

// ===================== 启动服务 =====================

const PORT = parseInt(process.env.POLICY_SERVICE_PORT || '8002', 10);
const HOST = process.env.POLICY_SERVICE_HOST || '0.0.0.0';

app.listen(PORT, HOST, () => {
  console.log(`=================================`);
  console.log(`🚀 PolicyService started`);
  console.log(`📍 Listening on http://${HOST}:${PORT}`);
  console.log(`📋 API endpoints:`);
  console.log(`   POST   /predict`);
  console.log(`   POST   /batch-predict`);
  console.log(`   GET    /health`);
  console.log(`   GET    /metrics`);
  console.log(`   POST   /deploy`);
  console.log(`   POST   /rollback`);
  console.log(`=================================`);
});

// 优雅关闭
process.on('SIGTERM', () => {
  console.log('[PolicyService] SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  console.log('[PolicyService] SIGINT received, shutting down gracefully');
  process.exit(0);
});
