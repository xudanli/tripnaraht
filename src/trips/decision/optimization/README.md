# Decision OS - 智能决策优化系统

> 基于六元组 D=(S,A,T,C,R,Π) 的专利级决策系统实现

## 概述

Decision OS 是一个完整的决策优化框架，实现了：
- **CGUS 算法**: 约束引导效用搜索
- **概率推理**: Monte Carlo 采样 + 重要性采样
- **可微决策**: 端到端神经网络架构
- **在线学习**: 策略梯度 + 权重学习闭环

## 目录结构

```
src/trips/decision/optimization/
├── benchmark/           # 性能基准测试
├── cache/               # 多级缓存 (LRU + Redis)
├── cli/                 # 命令行管理工具
├── controllers/         # API 控制器
│   ├── admin/          # 管理端 API
│   └── user/           # 用户端 API
├── differentiable/      # 可微决策模块
├── dto/                 # 请求验证 DTO
├── errors/              # 错误类型和处理
├── events/              # 事件驱动架构
├── examples/            # 使用示例
├── exploration/         # 探索机制 (Information Gain)
├── health/              # 健康检查 (K8s 探针)
├── integration/         # 集成测试
├── learning/            # 学习模块
│   ├── entities/       # 数据库实体
│   └── *.service.ts    # 学习服务
├── meta/               # 元决策
├── metrics/            # 监控指标
├── planning/           # 多步规划
├── probabilistic/      # 概率推理
├── resilience/         # 弹性模式 (熔断器)
├── sdk/                # API 客户端 SDK
├── theory/             # 理论证明实现
├── decision-os-facade.service.ts  # 统一门面服务
└── optimization.module.ts         # 模块定义
```

## 核心服务

### 1. CGUS 搜索 (`cgus-search.service.ts`)

约束引导效用搜索五步算法：

```typescript
import { CGUSSearchService } from './cgus-search.service';

const result = cgusService.search(candidates, context, {
  useMonteCarlo: true,
  useRollout: true,
  useExploration: true,
});

// 获取推荐方案
const recommended = result.recommended;
```

### 2. 期望效用计算 (`probabilistic/expected-utility.service.ts`)

Monte Carlo 采样和重要性采样：

```typescript
import { ExpectedUtilityService } from './probabilistic/expected-utility.service';

// 标准 Monte Carlo
const result = utilityService.computeExpectedUtility(dso, {
  numSamples: 1000,
});

// 重要性采样 (低方差)
const isResult = utilityService.computeExpectedUtilityWithImportanceSampling(
  dso,
  { proposalType: 'SHIFTED_MEAN', numSamples: 500 }
);
```

### 3. 策略网络 (`learning/policy-network.service.ts`)

神经网络策略学习：

```typescript
import { PolicyNetworkService } from './learning/policy-network.service';

const policyNetwork = new PolicyNetworkService();

// 推理
const output = policyNetwork.computePolicy(dso, explore=true);
console.log(output.selectedAction);      // 'ACCEPT_PLAN'
console.log(output.actionProbabilities); // Map<ActionType, number>
console.log(output.entropy);             // 策略熵

// 训练
policyNetwork.updatePolicy([
  { state: dso, action: 'ACCEPT_PLAN', reward: 0.8 },
]);
```

### 4. 可微决策 (`differentiable/differentiable-decision.service.ts`)

DSO 编码器和效用网络：

```typescript
import { DifferentiableDecisionService } from './differentiable/differentiable-decision.service';

const diffService = new DifferentiableDecisionService();

// 编码 DSO 到嵌入向量
const embedding = diffService.encodeDSO(dso);  // { z: number[], cache: ForwardCache }

// 计算效用
const utility = diffService.computeUtility(embedding);  // 0.0 ~ 1.0

// 端到端训练
const result = await diffService.train([
  { dso: dso1, targetUtility: 0.8 },
  { dso: dso2, targetUtility: 0.6 },
], { learningRate: 0.01 });
```

### 5. 在线学习循环 (`learning/online-learning-loop.service.ts`)

闭环学习系统：

```typescript
import { OnlineLearningLoopService } from './learning/online-learning-loop.service';

const loop = new OnlineLearningLoopService(
  weightLearner,
  persistence,
  regretTracker,
  differentiableDecision,
);

// 记录决策
loop.recordDecision(decisionId, userId, dso, predictedUtility);

// 处理反馈
const result = await loop.processDecisionOutcome({
  decisionId,
  userId,
  satisfactionScore: 0.85,
  actualUtility: 0.82,
  timestamp: new Date().toISOString(),
});

// 获取状态
const state = loop.getState();
// { totalDecisions, totalFeedback, totalUpdates, convergenceStatus }
```

### 6. DSO 快照审计 (`learning/dso-snapshot-audit.service.ts`)

状态追踪和回滚：

```typescript
import { DSOSnapshotAuditService } from './learning/dso-snapshot-audit.service';

const audit = new DSOSnapshotAuditService();

// 记录快照
await audit.recordSnapshot(requestId, dso, { trigger: 'STATE_UPDATE' });

// 获取历史
const history = await audit.getStateHistory(requestId);

// 计算差异
const diffs = await audit.computeDiff(requestId, fromVersion, toVersion);

// Lyapunov 稳定性追踪
const trace = await audit.getLyapunovTrace(requestId);
console.log(trace.isDecreasing);  // true = 稳定

// 回滚
const rolledBack = await audit.rollback(requestId, targetVersion);
```

### 7. 分布式锁 (`redis/distributed-lock.service.ts`)

原子操作保护：

```typescript
import { DistributedLockService } from '../../../redis/distributed-lock.service';

const lock = new DistributedLockService(cacheManager);

// 获取锁
const result = await lock.acquire('dso:user-123', { ttlMs: 5000 });
if (result.acquired) {
  try {
    // 执行原子操作
  } finally {
    await lock.release(result.handle!);
  }
}

// 或使用 withLock
await lock.withLock('dso:user-123', async () => {
  // 自动获取和释放锁
});
```

### 8. 监控指标 (`metrics/decision-metrics.service.ts`)

Prometheus 指标导出：

```typescript
import { DecisionMetricsService } from './metrics/decision-metrics.service';

const metrics = new DecisionMetricsService();

// 记录指标
metrics.recordDecisionLatency(0.5, 'PLAN_GEN', 'success');
metrics.recordUtilityScore(0.8, 'travel_plan');
metrics.incrementConstraintViolation('TIME_BUDGET', 'soft');
metrics.setCumulativeRegret('user-123', 0.05);
metrics.setLyapunovValue('req-123', 0.3);

// 导出 Prometheus 格式
const prometheus = metrics.exportPrometheusFormat();

// 获取 JSON 摘要
const summary = metrics.getSummary();
```

### 9. 统一门面服务 (`decision-os-facade.service.ts`)

整合所有组件的高层 API：

```typescript
import { DecisionOSFacadeService } from './decision-os-facade.service';

const facade = new DecisionOSFacadeService(
  objectiveFunction,
  expectedUtility,
  worldModel,
  policyNetwork,
  learningLoop,
  weightLearner,
  differentiable,
  auditService,
  metricsService,
  lockService,
);

// 执行决策
const response = await facade.makeDecision({
  requestId: 'req-001',
  userId: 'user-001',
  dso: decisionState,
  options: { useMonteCarlo: true, lockTimeout: 5000 },
});

console.log(response.recommendedAction);  // 'ACCEPT_PLAN'
console.log(response.expectedUtility);    // 0.82
console.log(response.confidence);         // 0.85

// 处理反馈
const feedbackResult = await facade.processFeedback({
  decisionId: 'req-001',
  userId: 'user-001',
  satisfactionScore: 0.9,
  actualUtility: 0.85,
});

// 系统状态
const status = facade.getSystemStatus();

// 稳定性分析
const stability = await facade.getStabilityReport('req-001');
```

### 10. 健康检查 (`health/decision-os-health.indicator.ts`)

Kubernetes 探针集成：

```typescript
import { DecisionOSHealthIndicator } from './health/decision-os-health.indicator';

const health = new DecisionOSHealthIndicator(facade, metrics, audit, lock);

// 完整健康检查
const result = await health.check();
// { decisionOS: { status: 'up', details: { ... } } }

// Liveness 探针
const alive = await health.isAlive();

// Readiness 探针
const ready = await health.isReady();
```

## API 端点

### 管理端 API

| 端点 | 方法 | 说明 |
|------|------|------|
| `/api/v2/admin/dso-audit/snapshots` | GET | 查询 DSO 快照 |
| `/api/v2/admin/dso-audit/snapshots/:requestId/latest` | GET | 获取最新快照 |
| `/api/v2/admin/dso-audit/stability/:requestId` | GET | Lyapunov 稳定性分析 |
| `/api/v2/admin/dso-audit/diff` | POST | 计算版本差异 |
| `/api/v2/admin/dso-audit/rollback` | POST | 状态回滚 |
| `/api/v2/admin/metrics/prometheus` | GET | Prometheus 指标 |
| `/api/v2/admin/metrics/health` | GET | 健康检查 |
| `/api/v2/admin/metrics/decision-stats` | GET | 决策统计 |
| `/health` | GET | 完整健康检查 |
| `/health/live` | GET | Kubernetes liveness 探针 |
| `/health/ready` | GET | Kubernetes readiness 探针 |
| `/health/startup` | GET | Kubernetes startup 探针 |

## 性能指标

| 操作 | P95 延迟 | 阈值 |
|------|----------|------|
| DSO Snapshot | 0.01ms | 10ms |
| Policy Inference | 0.14ms | 5ms |
| DSO Encoding | 0.05ms | 2ms |
| Lock Acquire | 0.04ms | 5ms |
| Metrics Recording | <0.01ms | 1ms |

## 测试

运行所有测试：

```bash
# 单元测试
npm test -- --testPathPatterns="policy-network|distributed-lock|dso-snapshot-audit|decision-metrics|online-learning-loop"

# 集成测试
npm test -- --testPathPatterns="decision-flow.integration"

# 性能基准
npm test -- --testPathPatterns="decision-os-benchmark"
```

## 监控

### Grafana Dashboard

导入 `monitoring/grafana/decision-os-dashboard.json` 到 Grafana。

### Prometheus 配置

```yaml
scrape_configs:
  - job_name: 'decision-os'
    static_configs:
      - targets: ['localhost:3000']
    metrics_path: '/api/v2/admin/metrics/prometheus'
```

## 数据库

### Prisma Schema

```prisma
model UserDecisionWeights {
  id                 String   @id @default(uuid())
  userId             String   @unique @map("user_id")
  weights            Json
  version            Int      @default(1)
  learningConfidence Float    @default(0.5)
  // ...
}

model DsoSnapshot {
  id            String   @id @default(uuid())
  requestId     String   @map("request_id")
  version       Int
  phase         String
  dsoData       Json     @map("dso_data")
  lyapunovValue Float?   @map("lyapunov_value")
  // ...
}
```

### 迁移

```bash
npx prisma migrate dev --name decision_os_learning
```

## 理论基础

### 六元组定义

```
D = (S, A, T, C, R, Π)

S: 状态空间 (DecisionState)
A: 动作空间 {ACCEPT_PLAN, MODIFY_PLAN, REGENERATE, ...}
T: 状态转移函数 T(s'|s,a)
C: 约束函数 C(s,a) ∈ {feasible, infeasible}
R: 效用函数 R(s,a) ∈ [0,1]
Π: 策略函数 π(a|s)
```

### Lyapunov 稳定性

```
V(DSO) = α·||violations|| + β·(1-confidence) + γ·(1-progress)

若 STATE_UPDATE 满足:
1. 版本单调递增
2. 约束违反递减
3. 置信度递增

则 V(DSO_{t+1}) ≤ V(DSO_t) - ε，系统渐近稳定
```

### Regret Bound

```
Regret(T) = Σ_{t=1}^T [U*(s_t) - U(a_t|s_t)] = O(√T)
```

## 高级功能

### 事件驱动架构 (`events/`)

```typescript
import { DecisionEventBus, DecisionEventType } from './events';

const eventBus = new DecisionEventBus();

// 订阅事件
eventBus.on(DecisionEventType.DECISION_COMPLETED, (event) => {
  console.log(`决策完成: ${event.action}, 效用: ${event.utility}`);
});

// 发送事件
emitter.decisionCompleted('req-001', 'user-001', 'ACCEPT_PLAN', 0.85, 0.9, 50);
```

### 缓存层 (`cache/`)

```typescript
import { DecisionCacheService, DecisionCacheKeys } from './cache';

const cache = new DecisionCacheService();

// 缓存穿透保护
const result = await cache.getOrSet(
  DecisionCacheKeys.utilityResult('req-001'),
  async () => computeExpensiveUtility(),
  { ttlMs: 60000 }
);

// 缓存失效
await cache.invalidatePattern('decision:dso:*');
```

### 熔断器 (`resilience/`)

```typescript
import { CircuitBreakerService, DecisionOSCircuitConfigs } from './resilience';

const circuitService = new CircuitBreakerService();

const breaker = circuitService.getOrCreate('database', {
  config: DecisionOSCircuitConfigs.database,
  fallback: () => defaultValue,
});

const result = await breaker.execute(() => databaseOperation());
```

### SDK 客户端 (`sdk/`)

```typescript
import { createDecisionOSClient } from './sdk';

const client = createDecisionOSClient({
  baseUrl: 'http://api.example.com',
  apiKey: 'your-key',
  timeout: 5000,
  retries: 3,
});

const decision = await client.makeDecision({
  requestId: 'req-001',
  userId: 'user-001',
  dso: decisionState,
});
```

### CLI 工具 (`cli/`)

```bash
# 查看状态
npx ts-node cli/decision-os-cli.ts status

# 健康检查
npx ts-node cli/decision-os-cli.ts health

# 查看指标
npx ts-node cli/decision-os-cli.ts metrics prometheus

# 稳定性分析
npx ts-node cli/decision-os-cli.ts snapshots stability req-001
```

### 速率限制 (`middleware/`)

```typescript
import { RateLimiterService, DecisionOSRateLimits, TokenBucketLimiter } from './middleware';

const limiter = new RateLimiterService();

// 固定窗口限流
const info = await limiter.checkLimit('user:123', DecisionOSRateLimits.decision);
if (info.remaining <= 0) {
  throw new Error(`Rate limit exceeded. Retry after ${info.retryAfter}s`);
}

// 令牌桶限流
const bucket = limiter.getTokenBucket('api', { capacity: 100, refillRate: 10, refillIntervalMs: 1000 });
if (!bucket.tryConsume('user:123', 1)) {
  throw new Error('Token bucket exhausted');
}
```

### 分布式追踪 (`tracing/`)

```typescript
import { DecisionTracingService, DecisionTraceAttributes, SpanKind } from './tracing';

const tracer = new DecisionTracingService({ serviceName: 'decision-os' });

// 手动 Span
const span = tracer.startSpan('process-decision', { kind: SpanKind.SERVER });
span.setAttribute(DecisionTraceAttributes.REQUEST_ID, 'req-001');
span.addEvent('optimization-started');
// ... 业务逻辑 ...
span.setStatus(SpanStatus.OK);
span.end();

// 自动 Span 包装
const result = await tracer.withSpan('compute-utility', async (span) => {
  span.setAttribute(DecisionTraceAttributes.UTILITY, 0.85);
  return computeUtility();
});

// 上下文传播
const headers = tracer.injectContext(); // { traceparent: '00-...-...-01' }
```

### 审计日志 (`interceptors/`)

```typescript
import { AuditLogService, DecisionRequestInterceptor } from './interceptors';

const auditService = new AuditLogService();

// 记录审计日志
auditService.log({
  requestId: 'req-001',
  userId: 'user-001',
  action: 'MAKE_DECISION',
  resource: 'decision',
  method: 'POST',
  path: '/api/v2/decision',
  statusCode: 200,
  durationMs: 150,
});

// 查询审计日志
const logs = auditService.query({ userId: 'user-001', limit: 50 });

// 获取统计
const stats = auditService.getStats();
console.log(`成功率: ${stats.successRate}, 平均延迟: ${stats.averageDuration}ms`);
```

### 特性开关 (`features/`)

```typescript
import { FeatureFlagService, FeatureFlagType } from './features';

const flagService = new FeatureFlagService();

// 布尔开关
if (flagService.isEnabled('decision.monte_carlo_sampling')) {
  // 使用 Monte Carlo 采样
}

// 百分比滚动发布
const result = flagService.evaluate('decision.policy_learning', { userId: 'user-001' });
if (result.enabled) {
  // 50% 用户启用策略学习
}

// A/B 测试
const abResult = flagService.evaluate('decision.optimization_algorithm', { userId: 'user-001' });
if (abResult.variant === 'cgus') {
  // 使用 CGUS 算法
} else {
  // 使用传统算法
}

// 记录转化
flagService.recordABTestConversion('decision.optimization_algorithm', 'user-001', true);
```

## JWT 认证

提供完整的认证和授权功能：

```typescript
import { 
  JwtAuthService, 
  ApiKeyAuthService,
  DecisionOSPermissions,
  RequirePermissions,
  Public 
} from './auth';

// 生成令牌
const jwtService = new JwtAuthService({ secret: 'your-secret' });
const tokens = jwtService.generateToken('user-001', {
  roles: ['user'],
  permissions: [DecisionOSPermissions.DECISION_READ],
});

// API Key 认证
const apiKeyService = new ApiKeyAuthService();
apiKeyService.registerKey('key-123', {
  name: 'service-app',
  roles: ['service'],
  permissions: [DecisionOSPermissions.ADMIN_ALL],
});

// 装饰器保护端点
@RequirePermissions(DecisionOSPermissions.DECISION_WRITE)
async makeDecision() { }

@Public()
async healthCheck() { }
```

## 事件溯源

完整的事件溯源实现：

```typescript
import { 
  EventSourcingService, 
  DecisionAggregate,
  InMemoryEventStore 
} from './events';

const store = new InMemoryEventStore();
const service = new EventSourcingService(store);

// 创建聚合并记录事件
const aggregate = new DecisionAggregate('req-001');
aggregate.startDecision('user-001');
aggregate.completeDecision('ACCEPT', 0.9);
await service.save(aggregate);

// 重建状态
const loaded = await service.load('req-001', 'Decision', id => new DecisionAggregate(id));

// 回放到特定版本
const state = await service.rebuildState('req-001', 'Decision', id => new DecisionAggregate(id), 2);
```

## 批量操作

高性能批量处理：

```typescript
import { BatchDecisionService, BatchFeedbackService, BatchExecutor } from './batch';

// 批量决策
const decisionService = new BatchDecisionService();
const decisions = await decisionService.processBatch(requests, {
  concurrency: 10,
  retries: 2,
  timeoutMs: 5000,
});

// 批量反馈
const feedbackService = new BatchFeedbackService();
const feedback = await feedbackService.processBatch(feedbackRequests);

// 自定义批量执行
const executor = new BatchExecutor('Custom', processor, {
  concurrency: 5,
  stopOnError: false,
  onProgress: (done, total) => console.log(`${done}/${total}`),
});
```

## 文档

- [专家团队规范](../../docs/DECISION_OS_EXPERT_TEAM_SPEC.md)
- [Lyapunov 稳定性证明](../../docs/LYAPUNOV_STABILITY_PROOF.md)
- [专家团队评估报告](../../docs/EXPERT_TEAM_EVALUATION_REPORT.md)
- [部署指南](../../docs/DECISION_OS_DEPLOYMENT.md)

---

## OpenTelemetry 追踪导出

支持 OTLP、Jaeger、Zipkin 格式：

```typescript
import { 
  OTLPSpanExporter, 
  createSampler,
  JaegerSpanConverter 
} from './tracing';

// OTLP 导出器
const exporter = new OTLPSpanExporter({
  endpoint: 'http://jaeger:4318/v1/traces',
  serviceName: 'decision-os',
  batchSize: 512,
}, { type: 'ratio', ratio: 0.1 });

// 采样控制
if (exporter.shouldSample(traceId)) {
  exporter.export(span);
}

// Jaeger 格式转换
const jaegerSpan = JaegerSpanConverter.toJaeger(otelSpan);
```

## Prometheus 指标

完整的 Prometheus 指标支持：

```typescript
import { MetricRegistry, DecisionOSMetrics } from './metrics';

const registry = new MetricRegistry();
const metrics = new DecisionOSMetrics(registry);

// 记录决策
metrics.recordDecision('ACCEPT', 'success', 0.15);
metrics.recordFeedback(0.85);

// 缓存指标
metrics.recordCacheHit('policy');
metrics.setCircuitState('main', 'closed');

// 导出 Prometheus 格式
const output = metrics.getPrometheusOutput();
```

## WebSocket 实时更新

实时决策状态推送：

```typescript
import { WebSocketManager, DecisionWebSocketService, DecisionOSChannels } from './websocket';

const manager = new WebSocketManager();
const wsService = new DecisionWebSocketService(manager);

// 客户端订阅
manager.registerClient('client-1', 'user-001');
wsService.subscribeToDecisionUpdates('client-1');
wsService.subscribeToLearningProgress('client-1');

// 推送更新
wsService.publishDecisionUpdate({
  requestId: 'req-001',
  phase: 'OPTIMIZE',
  progress: 0.75,
});

wsService.publishLearningProgress({
  iteration: 50,
  totalIterations: 100,
  loss: 0.02,
  accuracy: 0.95,
  phase: 'training',
});
```

## 文档

- [专家团队规范](../../docs/DECISION_OS_EXPERT_TEAM_SPEC.md)
- [Lyapunov 稳定性证明](../../docs/LYAPUNOV_STABILITY_PROOF.md)
- [专家团队评估报告](../../docs/EXPERT_TEAM_EVALUATION_REPORT.md)
- [部署指南](../../docs/DECISION_OS_DEPLOYMENT.md)

---

## 配置管理

类型安全的配置服务：

```typescript
import { DecisionOSConfigService } from './config';

const configService = new DecisionOSConfigService({
  general: { serviceName: 'my-service' },
  decision: { defaultTimeoutMs: 10000 },
});

// 获取配置
const decisionConfig = configService.get('decision');

// 更新配置
configService.update('learning', { learningRate: 0.01 });

// 配置变更监听
const unsubscribe = configService.onChange('decision', (newConfig) => {
  console.log('Decision config changed:', newConfig);
});

// 配置回滚
configService.rollback(0);
```

## 请求验证

可扩展的验证管道：

```typescript
import { 
  DecisionValidationPipe, 
  CompositeValidator,
  RequiredValidator,
  NumberValidator 
} from './validation';

const validator = new CompositeValidator()
  .addValidator('requestId', new RequiredValidator('requestId'))
  .addValidator('score', new NumberValidator('score', { min: 0, max: 1 }));

const result = validator.validate({ requestId: 'req-001', score: 0.85 });
```

## TensorFlow.js 机器学习

基于 TensorFlow.js 的神经网络策略学习：

```typescript
import { 
  TFJSPolicyNetworkService, 
  TFJSDifferentiableDecisionService,
  TFJSModelPersistenceService
} from './ml';

// 策略网络
const policyNetwork = new TFJSPolicyNetworkService({
  inputDim: 64,
  hiddenLayers: [128, 64, 32],
  outputDim: 10,
  learningRate: 0.001,
});
await policyNetwork.initialize();

// 预测动作
const state = Array(64).fill(0.5);
const output = await policyNetwork.predict(state);
console.log('Selected action:', output.selectedAction);
console.log('Confidence:', output.confidence);

// 策略梯度训练
const samples = [
  { state: [...], action: 2, reward: 1.0 },
  { state: [...], action: 1, reward: 0.5 },
];
const result = await policyNetwork.trainPolicyGradient(samples);
console.log('Training loss:', result.loss);

// Actor-Critic 网络 (A2C/PPO)
const a2c = new TFJSDifferentiableDecisionService({
  stateSize: 64,
  actionSize: 10,
  gamma: 0.99,
  tau: 0.95,
});
await a2c.initialize();

const trajectory = {
  states: [...],
  actions: [...],
  rewards: [...],
  values: [...],
  logProbs: [...],
  dones: [...],
};

// PPO 训练
const ppoResults = await a2c.trainPPO(trajectory, 0.2, 4);

// 模型持久化
const persistence = new TFJSModelPersistenceService('./models');
await persistence.saveModel(
  policyNetwork.model, 
  'decision_policy', 
  'policy',
  { trainedEpochs: 100, lastLoss: 0.05 }
);

// 加载模型
const loadedModel = await persistence.loadModel('decision_policy');

// 检查点管理
await persistence.createCheckpoint(policyNetwork.model, modelId, 50, 0.08);
const checkpoint = await persistence.loadFromCheckpoint(modelId, 50);
```

## P1/P2 性能优化

### 贝叶斯优化 (`learning/bayesian-optimizer.service.ts`)

高斯过程 + Expected Improvement：

```typescript
import { BayesianOptimizerService } from './learning/bayesian-optimizer.service';

const optimizer = new BayesianOptimizerService();
optimizer.configure({
  dimensions: 5,
  bounds: [{ min: 0, max: 1 }, { min: 0, max: 1 }, ...],
  acquisitionFunction: 'ei',
});

// 添加观测
optimizer.addObservation([0.5, 0.3, ...], 0.85);

// 建议下一个采样点
const suggestion = optimizer.suggestNextPoint();
console.log(suggestion.point);           // 推荐参数
console.log(suggestion.acquisitionValue); // EI 值

// 完整优化循环
const result = await optimizer.optimize(
  async (x) => evaluateObjective(x),
  initialPoints
);
console.log(result.bestPoint, result.bestValue);
```

### Experience Replay + Target Network (`learning/policy-network.service.ts`)

强化学习完整训练循环：

```typescript
import { PolicyNetworkService, Experience } from './learning/policy-network.service';

const policyNet = new PolicyNetworkService();

// 配置 Target Network
policyNet.configureTargetNetwork({
  enabled: true,
  softUpdateTau: 0.005,
  useSoftUpdate: true,
});

// 添加经验到 Replay Buffer
policyNet.addExperience({
  state: dso,
  action: 'ACCEPT_PLAN',
  reward: 0.9,
  nextState: nextDso,
  done: false,
  timestamp: Date.now(),
});

// 从 Buffer 训练
const trainResult = policyNet.trainFromReplay(0.99);
console.log(trainResult?.loss, trainResult?.batchSize);
```

### 自适应采样 (`probabilistic/expected-utility.service.ts`)

基于方差的动态采样：

```typescript
import { ExpectedUtilityService } from './probabilistic/expected-utility.service';

const utilityService = new ExpectedUtilityService();

// 自适应采样（自动确定样本数）
const result = utilityService.computeExpectedUtilityAdaptive(plan, context, weights, {
  minSamples: 50,
  maxSamples: 5000,
  targetVarianceCoef: 0.05,
});

console.log(result.adaptiveSampling.finalSampleSize);    // 实际采样数
console.log(result.adaptiveSampling.efficiencyGain);     // 节省比例
console.log(result.adaptiveSampling.convergenceReason);  // 'variance_target' | 'early_stop'
```

### 多级缓存 (`cache/multi-level-cache.service.ts`)

L1/L2/L3 三级缓存：

```typescript
import { MultiLevelCacheService, CacheKeys } from './cache/multi-level-cache.service';

const cache = new MultiLevelCacheService(redisCache);

// 缓存获取（自动多级查找）
const value = await cache.get<MyType>(CacheKeys.utilityResult(planHash, contextHash));

// 带回调的缓存获取
const result = await cache.getOrSet(
  'expensive-key',
  async () => computeExpensiveValue(),
  60000 // TTL
);

// 统计
const stats = cache.getStats();
console.log(`命中率: ${(stats.hitRate * 100).toFixed(1)}%`);
```

### 批量评估 (`batch/batch-evaluator.service.ts`)

批量约束检查和效用计算：

```typescript
import { BatchEvaluatorService } from './batch/batch-evaluator.service';

const batchEval = new BatchEvaluatorService();

// 批量评估候选方案
const result = await batchEval.batchEvaluate(
  candidates,
  weights,
  constraintChecker,
  utilityComputer
);

console.log(`可行方案: ${result.feasibleCount}`);
console.log(`最优方案: ${result.bestCandidateId}`);
console.log(`缓存命中: ${result.cacheHits}`);

// Pareto 筛选
const paretoSet = batchEval.batchParetoFilter(
  result.utilityResults,
  ['safety', 'experience', 'efficiency']
);
```

### 增量序列化 (`batch/incremental-serializer.service.ts`)

DSO 差分压缩：

```typescript
import { IncrementalSerializerService } from './batch/incremental-serializer.service';

const serializer = new IncrementalSerializerService();

// 序列化（自动选择全量或差分）
const snapshot = serializer.serialize(requestId, dso, version);
console.log(snapshot.type);  // 'full' | 'diff'
console.log(snapshot.size);  // 压缩后大小

// 反序列化
const restored = serializer.deserialize(requestId, targetVersion);

// 压缩统计
const stats = serializer.getCompressionStats(requestId);
console.log(`节省: ${stats.totalSavedBytes} 字节`);
```

## P3 扩展功能

### 决策可解释性 (`explainability/decision-explainer.service.ts`)

生成人类可读的决策解释：

```typescript
import { DecisionExplainerService } from './explainability/decision-explainer.service';

const explainer = new DecisionExplainerService();

// 配置语言和详细程度
explainer.configure({ language: 'zh', detailLevel: 'standard' });

// 生成完整解释
const explanation = explainer.explain(state, weights, candidates, selectedId);

console.log(explanation.summary);           // 摘要
console.log(explanation.keyFactors);        // 关键因素
console.log(explanation.tradeoffs);         // 权衡说明
console.log(explanation.riskAssessment);    // 风险评估
console.log(explanation.recommendation);    // 推荐建议

// 生成自然语言解释
const nlExplanation = explainer.generateNaturalLanguageExplanation(explanation);
```

### A/B 测试框架 (`experiments/ab-testing.service.ts`)

策略实验和统计分析：

```typescript
import { ABTestingService } from './experiments/ab-testing.service';

const abTesting = new ABTestingService();

// 创建实验
const experiment = abTesting.createExperiment(
  'new-weight-strategy',
  '测试新的权重学习策略',
  [
    { name: 'Control', weight: 50, config: {}, isControl: true },
    { name: 'Variant A', weight: 50, config: { learningRate: 0.01 }, isControl: false },
  ]
);

// 启动实验
abTesting.startExperiment(experiment.id);

// 获取用户分配
const assignment = abTesting.getAssignment(experiment.id, userId);
console.log(`用户分配到: ${assignment?.variantId}`);

// 记录指标
abTesting.recordMetric(experiment.id, userId, 'conversion', 1);
abTesting.recordMetric(experiment.id, userId, 'utility', 0.85);

// 分析结果
const result = abTesting.analyzeExperiment(experiment.id, 'conversion');
console.log(`P值: ${result.pValue}`);
console.log(`统计显著: ${result.statisticallySignificant}`);
console.log(`推荐: ${result.recommendation}`);
```

### 实时仪表盘 (`dashboard/realtime-dashboard.service.ts`)

系统监控和告警：

```typescript
import { RealtimeDashboardService } from './dashboard/realtime-dashboard.service';

const dashboard = new RealtimeDashboardService();

// 记录决策事件
dashboard.recordDecision(
  decisionId,
  userId,
  utility,     // 效用值
  latencyMs,   // 延迟
  success,     // 是否成功
  confidence,  // 置信度
  hasViolations // 是否有约束违反
);

// 获取仪表盘快照
const snapshot = dashboard.getSnapshot();
console.log(`系统状态: ${snapshot.health.status}`);
console.log(`总决策数: ${snapshot.metrics.totalDecisions}`);
console.log(`成功率: ${(snapshot.metrics.successfulDecisions / snapshot.metrics.totalDecisions * 100).toFixed(1)}%`);
console.log(`P95 延迟: ${snapshot.metrics.p95LatencyMs}ms`);

// 获取活跃告警
const alerts = dashboard.getActiveAlerts();
alerts.forEach(alert => {
  console.log(`[${alert.severity}] ${alert.component}: ${alert.message}`);
});
```

### SDK 生成器 (`sdk/sdk-generator.service.ts`)

多语言客户端 SDK 生成：

```typescript
import { SDKGeneratorService } from './sdk/sdk-generator.service';

const sdkGen = new SDKGeneratorService();

// 配置 SDK 信息
sdkGen.configure({
  name: 'decision-os-sdk',
  version: '1.0.0',
  baseUrl: 'https://api.example.com',
});

// 生成 TypeScript SDK
const tsSDK = sdkGen.generateTypeScriptSDK();
tsSDK.files.forEach(file => {
  console.log(`${file.path}: ${file.content.length} bytes`);
});

// 生成 Python SDK
const pySDK = sdkGen.generatePythonSDK();

// 生成 OpenAPI 规范
const openAPISpec = sdkGen.generateOpenAPISpec();
console.log(openAPISpec);
```

## 模块集成

完整的 NestJS 模块支持：

```typescript
import { DecisionOSModule } from './decision-os.module';

@Module({
  imports: [
    DecisionOSModule.forRoot({
      isGlobal: true,
      enableAuth: true,
      enableCache: true,
      enableTracing: true,
      enableMetrics: true,
      enableWebSocket: true,
      enableEventSourcing: true,
    }),
  ],
})
export class AppModule {}
```

## 文档

- **[使用指南](./docs/USAGE_GUIDE.md)** - 完整的使用说明和示例代码
- **[快速参考](./docs/QUICK_REFERENCE.md)** - 常用操作和配置速查表
- **[API 集成指南](./docs/API_INTEGRATION_GUIDE.md)** - 用户端/管理端接口文档
- [专家团队规范](../../docs/DECISION_OS_EXPERT_TEAM_SPEC.md)
- [Lyapunov 稳定性证明](../../docs/LYAPUNOV_STABILITY_PROOF.md)
- [专家团队评估报告](../../docs/EXPERT_TEAM_EVALUATION_REPORT.md)
- [部署指南](../../docs/DECISION_OS_DEPLOYMENT.md)

---

*版本: 2.8*
*测试覆盖: 737+ 测试*
*维护者: Decision OS 技术团队*

### 更新日志 (v2.8)

**P0 关键优化**
- 分布式状态一致性：StateManager 集成分布式锁
- RLHF 数据持久化：新增 Prisma Schema 和持久化服务
- 熔断器生产配置：生产环境专用参数

**P1 重要优化**
- 完整 RL 训练循环：Experience Replay + Target Network
- 贝叶斯优化：GP + Expected Improvement
- 自适应采样预算：基于方差的动态采样数

**P2 改进优化**
- 多级缓存：L1/L2/L3 三级缓存架构
- 并行采样：Worker Pool 实现
- 增量序列化：DSO 差分压缩
- 批量操作：批量约束检查和效用计算

**P3 扩展优化**
- 决策可解释性：人类可读的决策解释生成
- A/B 测试框架：策略实验和统计分析
- 实时仪表盘：系统健康监控和告警
- SDK 生成器：TypeScript/Python SDK 自动生成
